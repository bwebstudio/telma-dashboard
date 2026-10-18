'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { keepChosen } from '@/lib/service-duration'
import { isDemo } from '@/lib/demo/config'
import { PLAN_MINUTES, PLAN_PRICE } from '@/lib/plans'
import type { PlanType } from '@/lib/types'
import {
  countryOfRegion,
  regionLabel,
  SPECIALTY_LABEL,
  TIMEZONE,
  SIGNUP_PLANS,
  type Specialty,
  WHATSAPP_ON_SALE,
} from '@/lib/onboarding/catalog'
import { copyFor } from '@/lib/onboarding/copy'
import { planFits, type LanguageOption } from '@/lib/onboarding/languages'
import { sendWelcomeEmail } from '@/lib/onboarding/email-sender'
import { showcaseMode } from '@/lib/demo/config'
import { seedShowcaseClinic } from '@/lib/onboarding/showcase-seed'
import { buildSlots } from '@/lib/onboarding/schedule'
import { isRealProviderRef } from '@/lib/phone-state'
import { attachStockToClinic } from '@/lib/onboarding/twilio-provisioner'
import {
  DEFAULT_ONBOARDING_LOCALE,
  isOnboardingLocale,
  type OnboardingLocale,
} from '@/lib/onboarding/locale'
import { markCompleted, newToken, readDraft, saveStep } from '@/lib/onboarding/sessions'
import {
  createCheckoutSession,
  pricesByLookupKey,
  stripeConfigured,
} from '@/lib/onboarding/stripe-client'
import {
  provisionTwilioNumber,
  releaseTwilioNumber,
  sharedLineFor,
  type ProvisionedNumber,
} from '@/lib/onboarding/twilio-provisioner'
import { agentId } from '@/lib/onboarding/elevenlabs'
import { theVoice } from '@/lib/onboarding/voices'
import {
  isStepNumber,
  validateComplete,
  validateStep,
  type StepNumber,
  type WizardData,
} from '@/lib/onboarding/wizard-schema'

/**
 * The two things the sign-up form asks the server to do: keep what has been
 * typed, and turn it into a clinic.
 *
 * Both are unauthenticated by design. Nobody has an account until the second
 * one succeeds, which is why they use the service role and why every payload is
 * re-validated here rather than trusted from the browser.
 */

export interface StepState {
  ok: boolean
  /** Keyed by field name, as the form draws them. `_form` is the whole step. */
  errors?: Record<string, string>
  /** Minted on the first save so the browser can come back to this draft. */
  token?: string
}

export interface OnboardingResult {
  clinicId: string
  clinicName: string
  email: string
  /** Shown once, on the screen and in the email. Never stored in plain text. */
  password: string
  /** Null while Twilio has not sold us the line yet. */
  phoneNumber: string | null
  temporaryNumber: boolean
  dashboardUrl: string
  /** Where to send the browser to pay. Null when there is nothing to pay for
   *  here: demo mode, or Stripe not configured yet. */
  checkoutUrl: string | null
  /** True when no real number was bought and no real charge was made. */
  demo: boolean
}

export type SubmitState =
  | { ok: true; result: OnboardingResult }
  | { ok: false; errors: Record<string, string> }

// Saving one step ------------------------------------------------------------

/**
 * Validates one step and merges it into the draft.
 *
 * Returns the token on every call, not only the first: the browser may have
 * lost its localStorage between steps, and a sign-up that silently starts a
 * second draft halfway through is a sign-up that arrives here missing steps 1
 * to 3 and cannot say why.
 */
export async function submitWizardStep(
  step: number,
  data: unknown,
  token?: string | null,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<StepState> {
  const t = copyFor(locale)
  if (!isStepNumber(step)) {
    return { ok: false, errors: { _form: t.errorGeneric } }
  }

  const checked = validateStep(step as StepNumber, data, locale)
  if (!checked.ok) return { ok: false, errors: checked.errors }

  // ── CAUGHT WHERE IT WAS TYPED ─────────────────────────────────────────
  // Both of these used to surface at submit, after the plan, the address and
  // the terms. The email one did not even surface: it failed inside Supabase
  // Auth and the applicant watched the page scroll and do nothing. A clash
  // belongs on the step that asked for it, while the field is still on screen
  // and the answer is still in mind.
  const answers = checked.data as Record<string, unknown>

  if (step === 2) {
    const email = String(answers.email ?? '')
    const taken = email ? await emailTaken(email) : null
    if (taken) {
      return {
        ok: false,
        errors: { email: taken === 'clinica' ? t.errorEmailTaken : t.errorEmailStaff },
      }
    }
    if (await phoneTaken([String(answers.phone ?? '')])) {
      return { ok: false, errors: { phone: t.errorPhoneTaken } }
    }
  }

  if (step === 3 && answers.phone_option === 'keep') {
    if (await phoneTaken([String(answers.current_number ?? '')])) {
      return { ok: false, errors: { current_number: t.errorPhoneTaken } }
    }
  }

  const activeToken = token || newToken()

  try {
    await saveStep(activeToken, step as StepNumber, checked.data as Record<string, unknown>)
  } catch (e) {
    // The answers are valid and only the persistence failed. The browser still
    // holds them in localStorage, so the honest thing is to say the save failed
    // and let the applicant continue rather than block on our database.
    console.error('[onboarding] saveStep failed', e)
    return { ok: false, errors: { _form: t.errorGeneric }, token: activeToken }
  }

  return { ok: true, token: activeToken }
}

// Finishing ------------------------------------------------------------------

/**
 * Creates the clinic, its first user, its diary and its phone number.
 *
 * The order is chosen so that the expensive, externally visible step comes
 * last of the ones that can fail: the number is bought only once the clinic and
 * its login exist, and it is handed straight back if writing it to the clinic
 * fails. A Twilio number billed monthly against a clinic that was never created
 * is the one failure here nobody would notice for a month.
 *
 * `draftToken` is the source of truth, not the `data` argument, when both are
 * present. The browser sends what it has; the server signs up what it stored.
 */
export async function completeOnboarding(
  draftToken: string | null,
  fallbackData?: unknown,
  requestedLocale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<SubmitState> {
  const draft = draftToken ? await readDraft(draftToken) : null

  // The language the draft was filled in wins over the one the current request
  // is in. Somebody who typed six steps in Spanish and then landed here from a
  // Portuguese link should still get a Spanish panel and a Spanish email.
  const stored = (draft?.data as { locale?: unknown } | undefined)?.locale
  const locale: OnboardingLocale = isOnboardingLocale(stored) ? stored : requestedLocale
  const t = copyFor(locale)

  // Already done. Re-submitting must not create a second clinic, and the double
  // click that causes it is the most likely way this gets called twice.
  if (draft?.completedAt) {
    return { ok: false, errors: { _form: t.errorSubmit } }
  }

  // The stored draft wins for every answer it holds, and what the browser sends
  // fills only the gaps. Preferring one outright is what broke the final step
  // once already: the draft had steps 1 to 5, the browser had all six, and the
  // sign-up was validated against the half that was missing the terms box.
  //
  // Merging costs nothing in trust. Every key is re-validated below by the same
  // schemas either way, so an invented one is rejected exactly as before.
  const merged =
    draft?.data && fallbackData && typeof fallbackData === 'object'
      ? { ...(fallbackData as Record<string, unknown>), ...draft.data }
      : (draft?.data ?? fallbackData)

  const checked = validateComplete(merged, locale)
  if (!checked.ok) return { ok: false, errors: checked.errors }

  const wizard = checked.data
  const admin = createAdminClient()
  const demoMode = isDemo()

  const plan = wizard.plan_id as PlanType
  const plans = await signupPlans()
  const password = temporaryPassword()
  const dashboardUrl = await originUrl()

  let clinicId: string | null = null
  let authUserId: string | null = null
  let provisioned: ProvisionedNumber | null = null

  // The voice, checked against what is actually on offer. The step 4 schema can
  // only check the shape of the id: the list lives in an ElevenLabs account and
  // this is the first place that can reach it. Without this, a forged payload
  // could point a clinic at a voice that does not exist, and the failure would
  // surface as a silent phone line.
  // Which agent will answer, decided by what the clinic does and the language
  // it signed up in. Worked out before the insert so both the column and the
  // activity line below read the same answer.
  // The language Telma answers callers in, chosen in step 4. Distinct from the
  // language the form was filled in: a Barcelona clinic may do its paperwork in
  // Castilian and want its patients answered in Catalan.
  const clinicLanguage = wizard.greeting_language
  const agent = agentId()

  // Languages, checked against the catalogue and against the plan the clinic
  // just chose. The trigger on `clinics` enforces both again, which is where
  // the rule belongs; this is here so the failure is a field on a form rather
  // than a 500 with a Postgres message in it.
  const catalogue = await signupLanguages(locale)
  const sellable = new Set(
    catalogue.filter((l) => l.status === 'available').map((l) => l.code)
  )
  const chosenLanguages: string[] = wizard.selected_languages.filter((c) => sellable.has(c))
  if (!chosenLanguages.length) {
    return { ok: false, errors: { selected_languages: copyFor(locale).errorGeneric } }
  }

  const planMax = plans.find((p) => p.id === plan)?.maxLanguages ?? null
  if (!planFits(chosenLanguages.length, planMax)) {
    return {
      ok: false,
      errors: { selected_languages: copyFor(locale).errorTooManyLanguages },
    }
  }

  // The voice, from the language this clinic greets in, so a Lisbon clinic gets
  // a European Portuguese one and a Barcelona clinic a peninsular Spanish one.
  // Never chosen in the browser, so there is nothing to validate against a
  // forged payload. See `voiceId()` in lib/onboarding/elevenlabs.
  const chosenVoice = await theVoice(clinicLanguage)

  // Is this email already an account? Checked here, before anything is bought
  // or written. It used to surface from Supabase Auth halfway through, by which
  // point a Twilio number had been purchased and a clinic row created: the
  // rollback undid both, but with a funded account that is a number bought and
  // released for nothing, and a support question about a charge.
  const taken = await emailTaken(wizard.email)
  if (taken) {
    // Two different situations behind one collision, and they need different
    // sentences. A clinic that already signed up should sign in. A sales rep or
    // an internal account cannot become a clinic at all: Supabase Auth is one
    // user per email across the whole project, and `users.role` holds one role,
    // so the same address cannot be both. Telling that person to "sign in
    // instead" sends them to a panel that will never show them a clinic.
    return {
      ok: false,
      errors: { email: taken === 'clinica' ? t.errorEmailTaken : t.errorEmailStaff },
    }
  }

  try {
    // The number. Bought before the clinic row so a Twilio failure (no funds,
    // no numbers in that district) stops the sign-up before anything exists,
    // rather than leaving a clinic with no line and no explanation.
    // ── TELMA ALWAYS NEEDS A NUMBER OF HER OWN ───────────────────────────
    // Both options, and this is the half that was missing. A number is where
    // a call lands on our side; without one there is nothing for anybody to
    // reach, whatever the clinic chose.
    //
    // What the two options actually decide is who dials it. With a new number
    // it is the public one, on the cards and on Google. Keeping their own, it
    // is hidden: the clinic's number stays public and is forwarded here, and
    // no patient ever sees these digits.
    //
    // Until now `keep` bought nothing and stored the clinic's own number as
    // ours, so the forwarding codes we hand out told a clinic to forward its
    // number to itself. The feature was sold, explained and impossible.
    //
    // The region comes from the clinic itself when it is not buying a public
    // number, because the forwarded leg is billed to the clinic by its own
    // operator: a local number in its own province is a national call and
    // usually inside a business tariff, and one bought in another country is
    // an international call per patient.
    // ── AND KEEPING YOUR OWN NUMBER NEEDS NO NUMBER BOUGHT ───────────────
    // Nobody dials this line: it is the hidden end of the clinic's forward,
    // and the forward carries the number it came from, so one line can serve
    // every clinic that keeps its own. Buying one each was a number per
    // clinic in the country where numbers are hardest to get, for nothing.
    //
    // It matters right now and not in theory: Twilio's inventory on this
    // account covers 52 countries and neither Portugal nor Spain is among
    // them, so the alternative is not a slower number, it is a placeholder
    // that looks real, a forwarding card pointing at nothing, and a clinic
    // that finds out from a patient.
    const shared =
      wizard.phone_option === 'keep'
        ? await sharedLineFor(countryOfRegion(wizard.region))
        : null

    provisioned =
      shared ??
      // The region comes from the clinic itself when it is not buying a
      // public number, because the forwarded leg is billed to the clinic by
      // its own operator: a local number in its own province is a national
      // call and usually inside a business tariff, and one bought in another
      // country is an international call per patient.
      (await provisionTwilioNumber(
        wizard.phone_option === 'new' ? wizard.area_region : wizard.region
      ))

    const assignedPhone = provisioned.number

    // A clinic that has not paid yet is 'pausada', which already means exactly
    // this everywhere else in the panel: it exists, it is not answering. The
    // Stripe webhook is what makes it 'ativa'. With no Stripe configured there
    // is nothing to wait for, so it starts active.
    const pendingPayment = stripeConfigured() && !demoMode
    const now = new Date().toISOString()

    const { data: clinic, error: clinicErr } = await admin
      .from('clinics')
      .insert({
        name: wizard.clinic_name,
        contact_email: wizard.email,
        phone: wizard.phone,
        plan,
        minute_limit: PLAN_MINUTES[plan] ?? 250,
        // ── A CLINIC IS BORN UNCONFIGURED ────────────────────────────────
        // Not 'ativa'. The sign-up identifies the clinic and buys it a number;
        // it does not know the opening hours, what the clinic does, or how
        // Telma should answer, because it no longer asks. Turning her on at
        // this point would put a receptionist on the telephone who cannot say
        // when the clinic opens.
        //
        // 'por_configurar' rather than 'pausada': paused is a clinic that was
        // running and was stopped, and the panel has to tell a first morning
        // apart from a suspension. Everything downstream already refuses to
        // book unless the status is 'ativa' -- /api/availability blocks on it
        // and /api/voice/init hands `can_book: false` -- so Telma answers,
        // takes a message and promises nothing.
        status: pendingPayment ? 'pausada' : 'por_configurar',
        billing_cycle: wizard.billing_cycle,
        // What was bought on top of the plan. Every language beyond the first
        // is one of these, sold exactly like WhatsApp.
        // Languages are no longer add-ons: they are included, up to the number
        // the plan allows, and live in their own column.
        active_addons: wizard.addon_whatsapp && WHATSAPP_ON_SALE ? ['whatsapp'] : [],
        selected_languages: chosenLanguages,
        addon_whatsapp: Boolean(wizard.addon_whatsapp) && WHATSAPP_ON_SALE,
        specialty: wizard.specialty,
        region: wizard.region,
        services: wizard.services ?? [],
        // Free text from step 3. The only place a business outside the four
        // specialties gets to say what it does, so it goes to the agent prompt.
        custom_services: wizard.custom_services || null,
        // Only for the services actually chosen. A length left behind by a
        // service the clinic unticked on the way through would sit in the
        // record for ever, invisible, and come back if that service were ever
        // ticked again.
        service_durations: keepChosen(
          wizard.service_durations,
          wizard.services,
          wizard.custom_services
        ),
        service_prices: keepChosen(wizard.service_prices, wizard.services, wizard.custom_services),
        // How finely the day is cut. The sign-up already asks this as "how
        // often can an appointment start"; it just had nowhere to live before,
        // because the generator baked it into the rows it wrote.
        // La rejilla de la agenda sale de la duración, porque es lo que vale
        // para casi todas las clínicas y es una pregunta menos en el alta.
        slot_minutes: wizard.min_interval_minutes ?? wizard.appointment_duration_minutes ?? 30,
        address: wizard.address || null,
        price_info: wizard.price_info || null,
        formality: wizard.formality,
        fallback_policy: wizard.fallback_policy,
        fallback_number: wizard.fallback_number || null,
        briefing: wizard.briefing || null,
        emergency_number: wizard.emergency_number || null,
        // Off unless the clinic ticked the box on step five. A clinic that never
        // saw the question has not agreed to be rung at three in the morning.
        after_hours_transfer: wizard.after_hours_transfer === true,
        after_hours_number: wizard.after_hours_number || null,
        after_hours_patients_only: wizard.after_hours_patients_only !== false,
        emergency_protocol: wizard.emergency_protocol || null,
        language: chosenLanguages.includes(clinicLanguage) ? clinicLanguage : chosenLanguages[0],
        appointment_duration_minutes: wizard.appointment_duration_minutes,
        min_interval_minutes: wizard.min_interval_minutes ?? wizard.appointment_duration_minutes ?? 30,
        assigned_phone: assignedPhone,
        phone_source: wizard.phone_option === 'new' ? 'provisioned' : 'ported',
        phone_provider_ref: provisioned?.sid ?? null,
        // On the shared line, and not the clinic a direct call belongs to:
        // that one is declared, once, and the database holds it to one. A
        // sign-up never claims it. See 0059.
        assigned_phone_shared: Boolean(shared),
        answers_direct_calls: false,
        porting_details:
          wizard.phone_option === 'keep'
            ? {
                current_number: wizard.current_number,
                operator: wizard.operator,
                // Goes in here rather than in a column of its own: the shape
                // already exists and this belongs to the same fact, which is
                // how the clinic's own line is pointed at ours.
                forward_type: wizard.forward_type,
              }
            : null,
        // Two different things, in two different columns since 0023. The agent
        // is shared by every clinic on this language; the voice is this
        // clinic's own, and is the only half it chose.
        voice_agent_id: agent,
        voice_id: chosenVoice.id,
        voice_name: chosenVoice.name,
        // The clinic's own clock, worked out from its region. Madrid is an hour
        // ahead of Lisbon and this column is what decides where the agenda's day
        // starts, so a Spanish clinic left on the Europe/Lisbon default would see
        // its late appointments land on the wrong day.
        timezone: TIMEZONE[countryOfRegion(wizard.region)],
        onboarding_completed_at: now,
      })
      .select('id')
      .single()

    if (clinicErr || !clinic) throw new Error(clinicErr?.message ?? 'clinic')
    clinicId = clinic.id
    // `clinicId` stays nullable so the rollback can see whether the row was
    // ever written. Everything below this line needs the narrowed value.
    const cid: string = clinic.id

    // The login. Created after the clinic because `users.clinic_id` is not
    // nullable for a clinic role, and because an auth user with nowhere to
    // belong is harder to clean up than a clinic with nobody in it.
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: wizard.email,
      password,
      email_confirm: true,
    })
    if (authErr || !created.user) {
      // The pre-check above misses a user created between it and here, and one
      // that exists in Auth without a row in `users`. Either way the reader
      // needs the field, not a Supabase sentence in English.
      if (/already been registered|already exists/i.test(authErr?.message ?? '')) {
        await rollback(clinicId, null, provisioned)
        // Auth knows the address is taken but not what it is used for: a user
        // in Auth with no row in `users` has no role to report. The vaguer of
        // the two sentences is the honest one here.
        return { ok: false, errors: { email: t.errorEmailStaff } }
      }
      throw new Error(authErr?.message ?? 'auth')
    }
    authUserId = created.user.id

    const { error: userErr } = await admin.from('users').insert({
      id: created.user.id,
      email: wizard.email,
      role: 'clinica',
      clinic_id: cid,
      // The panel opens in the language the sign-up was filled in.
      locale,
    })
    if (userErr) throw new Error(userErr.message)

    // The diary. Written in one insert: a half-generated week is worse than
    // none, because the clinic cannot tell which hours are missing on purpose.
    // The diary the trigger created when the clinic was inserted. A window with
    // no diary behind it is saved, shown as correct, and never offered.
    const { data: diary } = await admin
      .from('resources')
      .select('id')
      .eq('clinic_id', cid)
      .order('created_at')
      .limit(1)
      .maybeSingle()

    // A linha que veio da prateleira passa a ser desta clínica. Feito depois
    // do insert, porque até aqui a clínica não tinha id.
    if (provisioned && !provisioned.demo) {
      await attachStockToClinic(provisioned.sid, cid)
    }

    const slots = buildSlots(wizard).map((s) => ({
      ...s,
      clinic_id: cid,
      resource_id: (diary as { id: string } | null)?.id ?? null,
    }))
    if (slots.length) {
      const { error: slotErr } = await admin.from('availability_slots').insert(slots)
      if (slotErr) throw new Error(slotErr.message)
    }

    // On a showcase deployment the panel opens with a morning already in it.
    // Without this a salesperson finishes the sign-up, opens the agenda and
    // finds nothing, and the person being shown has to imagine the product.
    // After the timetable, because the sample bookings take real free hours
    // from it.
    if (showcaseMode()) {
      try {
        await seedShowcaseClinic(cid, locale)
      } catch (e) {
        // Never fails the sign-up. A demo without examples is worth more than a
        // sign-up that broke on the last step in front of a client.
        console.error('[showcase] seed failed', e)
      }
    }

    await admin.from('activity_log').insert([
      {
        clinic_id: cid,
        type: 'clinic_created',
        message: `${wizard.clinic_name} inscreveu-se sozinha (${SPECIALTY_LABEL[
          wizard.specialty as Specialty
        ]}, ${regionLabel(wizard.region)}, plano ${plan})`,
      },
      // The two things that make a clinic look finished without being finished.
      // Both go in the log rather than in a comment, because the person who has
      // to act on them reads the activity screen and not this file.
      // Only the total absence of an agent is worth a warning. Landing on the
      // generic one is the design, not a shortfall, and a line in Atividade for
      // every single sign-up would train everyone to ignore the feed.
      ...(agent
        ? []
        : [
            {
              clinic_id: cid,
              type: 'needs_attention',
              message:
                'Sem agente configurado: defina ELEVENLABS_AGENT_ID e ligue esta clínica antes de divulgar o número.',
            },
          ]),
      ...(chosenVoice.wrongAccentRisk
        ? [
            {
              clinic_id: cid,
              type: 'needs_attention',
              message: `Voz sem sotaque garantido para ${clinicLanguage.toUpperCase()}: defina ELEVENLABS_VOICE_ID_${clinicLanguage.toUpperCase()} antes de esta clínica atender.`,
            },
          ]
        : []),
      ...(chosenVoice.missing
        ? [
            {
              clinic_id: cid,
              type: 'needs_attention',
              message:
                'Sem voz configurada: defina ELEVENLABS_VOICE_ID e ligue esta clínica antes de divulgar o número.',
            },
          ]
        : []),
      ...(provisioned?.demo
        ? [
            {
              clinic_id: cid,
              type: 'needs_attention',
              // Two different situations wearing the same flag, and the
              // difference decides who has to do something. No Twilio at all
              // is how this runs before the account is funded and nobody is
              // surprised by it. Twilio configured and refusing is a clinic
              // that signed up believing it has a line, and somebody here has
              // to find it a number before that number is on a door.
              message: provisioned.unavailable
                ? `O número ${provisioned.number} é fictício: a Twilio não deu número. ${provisioned.unavailable}`
                : `O número ${provisioned.number} é fictício: a Twilio não está configurada.`,
            },
          ]
        : []),
      ...(wizard.phone_option === 'keep'
        ? [
            {
              clinic_id: cid,
              type: 'needs_attention',
              message: `Portabilidade por iniciar: ${wizard.current_number} está na ${wizard.operator}.`,
            },
          ]
        : []),
    ])

    // Payment. Last, because everything above has to exist for the webhook to
    // have something to activate.
    const checkout = await createCheckoutSession({
      clinicId: cid,
      clinicName: wizard.clinic_name,
      email: wizard.email,
      plan,
      billingCycle: wizard.billing_cycle,
      priceIds: await priceIdsFor(plan, wizard.billing_cycle, Boolean(wizard.addon_whatsapp)),
      // The region the clinic picked decides the VAT treatment, so the country
      // is derived from it rather than asked for a second time.
      country: countryOfRegion(wizard.region),
      locale,
      successUrl: `${dashboardUrl}/inscricao/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${dashboardUrl}/inscricao?retomar=1`,
    })

    if (draftToken) await markCompleted(draftToken, cid)

    // The email is not allowed to fail the sign-up. The clinic exists, the
    // login works and the password is on screen; a bounced welcome message is a
    // support ticket, not a reason to roll back a paid account.
    const mail = await sendWelcomeEmail({
      clinicName: wizard.clinic_name,
      email: wizard.email,
      password,
      // Only when Twilio actually sold us one. The provisioner answers with a
      // number shaped like a real one so the rest of the system keeps
      // working, and this email is the one place where showing it would be a
      // lie told to somebody who has just paid.
      phoneNumber: isRealProviderRef(provisioned?.sid) ? assignedPhone : null,
      temporaryNumber: wizard.phone_option === 'keep',
      // Which calls they chose to send over. The email prints the codes for
      // that choice, and printing the wrong ones is worse than printing none:
      // a clinic that asked for "only the ones nobody answered" and dials the
      // unconditional code stops hearing its own phone ring.
      // Lo que acaba de contratar, con los importes que Stripe va a cobrar.
      // Si no se pueden leer, el correo sale sin el resumen en lugar de con
      // un importe inventado.
      summary: await contractedSummary(wizard, plan, locale),
      forwardType: wizard.phone_option === 'keep' ? wizard.forward_type : undefined,
      ownNumber: wizard.phone_option === 'keep' ? wizard.current_number : null,
      dashboardUrl,
      locale,
      pendingPayment,
    })
    if (!mail.sent) {
      await admin.from('activity_log').insert({
        clinic_id: cid,
        type: 'needs_attention',
        message: `O email de boas-vindas não saiu (${mail.error ?? mail.via}). Envie os acessos à mão.`,
      })
    }

    return {
      ok: true,
      result: {
        clinicId: cid,
        clinicName: wizard.clinic_name,
        email: wizard.email,
        password,
        phoneNumber: isRealProviderRef(provisioned?.sid) ? assignedPhone : null,
        temporaryNumber: wizard.phone_option === 'keep',
        dashboardUrl,
        checkoutUrl: checkout.url,
        demo: demoMode || checkout.demo,
      },
    }
  } catch (e) {
    console.error('[onboarding] completeOnboarding failed', e)
    await rollback(clinicId, authUserId, provisioned)
    return {
      ok: false,
      errors: { _form: e instanceof Error ? `${t.errorSubmit} (${e.message})` : t.errorSubmit },
    }
  }
}

// Helpers --------------------------------------------------------------------

/**
 * Is there already an account on this email?
 *
 * Asked against our own `users` table, which every clinic user is written to.
 * Supabase Auth has no lookup by email in the admin API short of paging through
 * every user, and paging through every user on each sign-up is a cost that
 * grows with the customer base to answer a question a single indexed row
 * already answers.
 *
 * It can be wrong in one direction only: an Auth user whose `users` row was
 * lost would pass here and fail later. That case is caught at the insert and
 * turned into the same field error, so the reader never sees the difference.
 */
/**
 * Is this telephone already signed up?
 *
 * Checked at the step that asks for it, not at submit. A clinic that types the
 * number it has had for twenty years and is told at the end, after the plan,
 * the address and the terms, that it cannot continue, has been made to fill in
 * a form for nothing.
 *
 * Three columns, because a number reaches us by three routes and all of them
 * mean the same clinic: `phone` is what the clinic gave as its own,
 * `assigned_phone` is the line Telma answers, and `porting_details.
 * current_number` is the number being forwarded to us. A second sign-up on
 * any of them is the same telephone arriving twice.
 *
 * Compared on digits alone. `+351 220 123 456` and `+351220123456` are one
 * number, and a clinic that typed it differently the second time is exactly
 * the case this exists to catch.
 */
export async function phoneTaken(numbers: string[]): Promise<boolean> {
  if (isDemo()) return false
  const wanted = numbers.map(digitsOf).filter((n) => n.length >= 6)
  if (!wanted.length) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('phone, assigned_phone, porting_details')
    .neq('status', 'cancelada')

  for (const row of (data ?? []) as Array<{
    phone?: string | null
    assigned_phone?: string | null
    porting_details?: { current_number?: string } | null
  }>) {
    const held = [row.phone, row.assigned_phone, row.porting_details?.current_number]
      .map((v) => digitsOf(v ?? ''))
      .filter(Boolean)
    if (held.some((h) => wanted.includes(h))) return true
  }
  return false
}

/** Digits only, so two spellings of one number compare equal. */
function digitsOf(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}

async function emailTaken(email: string): Promise<string | null> {
  if (isDemo()) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return (data?.role as string | undefined) ?? null
}

/**
 * Undoes a partial sign-up.
 *
 * Deleting the clinic cascades to its slots and its activity, and the auth user
 * has to go separately because it lives in Supabase's schema and not ours.
 * Every step swallows its own error: this runs while another failure is already
 * being reported, and a rollback that throws replaces a useful message with a
 * useless one.
 */
async function rollback(
  clinicId: string | null,
  authUserId: string | null,
  provisioned: ProvisionedNumber | null
): Promise<void> {
  const admin = createAdminClient()

  // Each step in its own try. The demo client implements `createUser` and not
  // `deleteUser`, so this is not a hypothetical: without the guard, cleaning up
  // a demo failure throws on the first line and leaves the number unreleased.
  if (authUserId) {
    try {
      await admin.auth.admin?.deleteUser?.(authUserId)
    } catch {
      /* already reported by the caller */
    }
  }
  if (clinicId) {
    try {
      await admin.from('clinics').delete().eq('id', clinicId)
    } catch {
      /* the cascade takes the slots and the log with it, or nothing does */
    }
  }
  // Not the shared line. It was never bought for this clinic and giving it
  // back would delete the only number every other clinic forwards to.
  if (provisioned && !provisioned.demo && !provisioned.shared) {
    try {
      await releaseTwilioNumber(provisioned.sid)
    } catch {
      /* logged below: a leaked number costs money and has to be visible */
      console.error('[onboarding] could not release number', provisioned.sid)
    }
  }
}

/**
 * The Stripe prices for what was bought.
 *
 * Read from the catalogue tables rather than hardcoded, because `plans` is
 * already the single place the price list lives. They are null until the
 * products exist in Stripe, and null is filtered out by the checkout, which
 * then takes the demo path. That is the intended behaviour today: the sign-up
 * must work before Stripe does.
 */
/**
 * WHAT THE CLINIC IS ABOUT TO BE CHARGED FOR.
 *
 * Asked of Stripe by name rather than read out of our own tables. The names
 * are lookup keys — `clinica_annual` — which are identical in test mode and
 * in live mode; the price ids behind them are not. Keeping ids in `plans`
 * meant repopulating that table on launch day, and the failure mode of
 * forgetting was every checkout dying the moment a real clinic tried to pay.
 *
 * It also fixes something that was quietly broken. This used to read one
 * `stripe_price_id` per plan, with no annual price anywhere, and said so in a
 * console warning nobody would see — so a clinic choosing "2 meses grátis"
 * would have been billed monthly. A cycle is part of the name now, so annual
 * either resolves or the sign-up stops.
 *
 * Returns an empty array when anything is missing, which `createCheckoutSession`
 * reads as "do not charge". Half a basket is worse than none.
 */
/**
 * The lookup keys this sign-up will be charged on.
 *
 * One definition, read by the checkout and by the summary that promises what
 * the checkout will do. Two lists would be two lists until the day somebody
 * adds a second add-on to one of them.
 */
export async function lookupKeysForQuote(
  plan: PlanType,
  cycle: 'monthly' | 'annual',
  whatsapp: boolean
): Promise<string[]> {
  // An async wrapper because this file is 'use server': every export has to
  // be awaitable. The quote lives in its own file and needs the same keys the
  // checkout uses, and copying them there is how the two drift.
  return lookupKeysFor(plan, cycle, whatsapp)
}

function lookupKeysFor(
  plan: PlanType,
  cycle: 'monthly' | 'annual',
  whatsapp: boolean
): string[] {
  if (plan === 'personalizado') return []
  const keys = [`${plan}_${cycle}`]
  if (whatsapp && WHATSAPP_ON_SALE) keys.push(`whatsapp_${cycle}`)
  return keys
}

async function priceIdsFor(
  plan: PlanType,
  cycle: 'monthly' | 'annual',
  whatsapp: boolean
): Promise<string[]> {
  if (isDemo()) return []

  // `personalizado` is quoted by hand and has no price in Stripe.
  if (plan === 'personalizado') return []

  const wanted = lookupKeysFor(plan, cycle, whatsapp)

  const found = await pricesByLookupKey(wanted)

  const missing = wanted.filter((k) => !found.has(k))
  if (missing.length) {
    console.error('[onboarding] no Stripe price for', missing.join(', '))
    return []
  }

  return wanted.map((k) => found.get(k)!)
}

/**
 * A temporary password somebody can read off a screen and type on a phone.
 *
 * No l, I, O, 0 or 1: this gets dictated over the phone to a receptionist at
 * least once, and the pairs that look alike in a sans-serif face are the whole
 * reason that call happens. Length carries the entropy instead: 16 characters
 * from a 32 symbol alphabet is 80 bits, and it is replaced on first login.
 */
function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789ACEF'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Where this app is reachable, for links in the email and the return URL. */
async function originUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, '')
  if (configured) return configured

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * The price list the last step draws.
 *
 * Served from the database when there is one, and from lib/plans otherwise, so
 * the wizard shows the same numbers as the panel and the invoice rather than a
 * third copy typed into a component.
 */
export async function signupPlans(): Promise<
  Array<{
    id: PlanType
    name: string
    description: string | null
    monthly: number | null
    annual: number | null
    minutes: number | null
    locations: number
    maxLanguages: number | null
  }>
> {
  // What the form offers, which since Rede left is not everything the `plans`
  // table prices. One list, so putting Rede back is one line in catalog.ts.
  const fallback = ([...SIGNUP_PLANS] as PlanType[]).map((id) => ({
    id,
    name: id === 'essencial' ? 'Essencial' : id === 'clinica' ? 'Clínica' : 'Rede',
    description: null,
    monthly: PLAN_PRICE[id],
    // Ten months: what the Stripe annual prices charge, what the site shows
    // and what "two months free" promises. It said eleven.
    annual: PLAN_PRICE[id] === null ? null : (PLAN_PRICE[id] as number) * 10,
    minutes: PLAN_MINUTES[id],
    // Only Rede is sold for more than one location (0055).
    locations: id === 'rede' ? 3 : 1,
    // One, two, three, matching 0054. Repeated only for the demo, which has
    // no `plans` table to read it from. It said 2 / 3 / 4 until the ceilings
    // were corrected and nothing pointed here, which is what a fallback does
    // when it duplicates a number instead of deriving it.
    maxLanguages: id === 'essencial' ? 1 : id === 'clinica' ? 2 : 3,
  }))

  if (isDemo()) return fallback

  const admin = createAdminClient()
  const { data } = await admin
    .from('plans')
    .select('id, name, description, price_monthly_eur, price_annual_eur, max_minutes_per_month, max_locations, max_languages_included')
    .in('id', [...SIGNUP_PLANS])

  if (!data?.length) return fallback

  // The admin client is `any` in demo mode, so the rows arrive untyped. Naming
  // the shape here rather than annotating each callback keeps the reason
  // visible: this is what the select above asked for.
  interface PlanRow {
    id: string
    name: string
    description: string | null
    price_monthly_eur: number | string | null
    price_annual_eur: number | string | null
    max_minutes_per_month: number | null
    max_locations: number | null
    max_languages_included: number | null
  }

  const order: PlanType[] = [...SIGNUP_PLANS] as PlanType[]
  return (data as PlanRow[])
    .map((p) => ({
      id: p.id as PlanType,
      name: p.name,
      description: p.description ?? null,
      monthly: p.price_monthly_eur === null ? null : Number(p.price_monthly_eur),
      annual: p.price_annual_eur === null ? null : Number(p.price_annual_eur),
      minutes: p.max_minutes_per_month === null ? null : Number(p.max_minutes_per_month),
      locations: Number(p.max_locations ?? 1),
      maxLanguages: p.max_languages_included === null ? null : Number(p.max_languages_included),
    }))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
}

/** Reads a draft back, for a browser that lost its localStorage but kept the
 *  token, and for the test page. Never returns a completed one. */
export async function loadDraft(
  token: string
): Promise<{ data: Record<string, unknown>; currentStep: number } | null> {
  const draft = await readDraft(token)
  if (!draft || draft.completedAt) return null
  return { data: draft.data, currentStep: draft.currentStep }
}

/**
 * Every language the platform knows about, in the order the picker draws them.
 *
 * Read from `available_languages`, which is the only place the list lives.
 * Including the ones that are not ready: the picker shows them disabled, which
 * answers "do you do German?" honestly instead of silently not offering it.
 */
export async function signupLanguages(locale: OnboardingLocale): Promise<LanguageOption[]> {
  if (isDemo()) {
    return [
      { code: 'pt', name: 'Português', label: locale === 'es' ? 'Portugués' : 'Português', status: 'available' },
      { code: 'es', name: 'Español', label: locale === 'es' ? 'Español' : 'Espanhol', status: 'available' },
      { code: 'ca', name: 'Català', label: locale === 'es' ? 'Catalán' : 'Catalão', status: 'available' },
      { code: 'en', name: 'English', label: locale === 'es' ? 'Inglés' : 'Inglês', status: 'available' },
      { code: 'fr', name: 'Français', label: locale === 'es' ? 'Francés' : 'Francês', status: 'coming_soon' },
    ]
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('available_languages')
    .select('code, name, name_pt, name_es, status')
    .neq('status', 'deprecated')
    .order('sort_order', { ascending: true })

  interface Row {
    code: string
    name: string
    name_pt: string
    name_es: string
    status: LanguageOption['status']
  }

  return ((data ?? []) as Row[]).map((r) => ({
    code: r.code,
    name: r.name,
    label: locale === 'es' ? r.name_es : r.name_pt,
    status: r.status,
  }))
}

/** The most languages any plan includes, so step 4 can cap the picker before
 *  the plan has been chosen on step 6. */
export async function maxLanguagesOnOffer(): Promise<number | null> {
  if (isDemo()) return 4

  const admin = createAdminClient()
  const { data } = await admin.from('plans').select('id, max_languages_included')
  const rows = (data ?? []) as Array<{ id: string; max_languages_included: number | null }>

  // Only the plans a clinic can actually buy here. 'personalizado' is unlimited
  // and is not on sale in the form, so letting it raise the cap would offer a
  // seventh language nobody could pay for.
  const sellable = rows.filter((r) => ['essencial', 'clinica', 'rede'].includes(r.id))
  if (!sellable.length) return 4
  if (sellable.some((r) => r.max_languages_included === null)) return null
  return Math.max(...sellable.map((r) => r.max_languages_included ?? 0))
}

/**
 * The lines the welcome email opens with, taken from the checkout's own quote.
 *
 * Not from the plans table. The table is what the site advertises; the quote
 * reads the prices Stripe will charge, and a receipt that disagrees with the
 * card statement is worse than no receipt. Returns undefined rather than
 * guessing: the email then simply has no summary, which is honest.
 */
async function contractedSummary(
  wizard: WizardData,
  plan: PlanType,
  locale: OnboardingLocale
): Promise<
  | {
      planName: string
      cycle: 'monthly' | 'annual'
      lines: Array<{ label: string; amount: number }>
      subtotal: number
      taxPercentage: number | null
      taxAmount: number
      total: number
      currency: string
    }
  | undefined
> {
  try {
    const { checkoutQuote } = await import('@/lib/actions/checkout-quote')
    const cycle = wizard.billing_cycle === 'annual' ? 'annual' : 'monthly'
    const quote = await checkoutQuote({
      plan,
      cycle,
      whatsapp: Boolean(wizard.addon_whatsapp),
      region: wizard.region,
    })
    if (!quote.ok || !quote.lines.length) return undefined

    const plans = await signupPlans()
    const planName = plans.find((x) => x.id === plan)?.name ?? plan

    return {
      planName,
      cycle,
      // Just the name. The cycle rides on the amount ("249 €/mes"), which
      // reads once instead of twice and stopped a Portuguese email from
      // saying "Plan Clínica, mensual" in Spanish.
      lines: quote.lines.map((l) => ({
        label: l.kind === 'whatsapp' ? 'WhatsApp' : planName,
        amount: l.amount,
      })),
      subtotal: quote.subtotal,
      taxPercentage: quote.taxPercentage,
      taxAmount: quote.taxAmount,
      total: quote.total,
      currency: quote.currency,
    }
  } catch {
    return undefined
  }
}
