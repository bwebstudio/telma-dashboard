'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { writeClinicOverride } from '@/lib/demo/overrides'
import { store } from '@/lib/demo/data'
import { normalisePhone, wizardSchemas } from '@/lib/onboarding/wizard-schema'
import { DEFAULT_ONBOARDING_LOCALE, type OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * How this clinic wants pre-marcações handled.
 *
 * The clinic id is never taken from the form. It comes from the session, so a
 * crafted request cannot change the settings of a clinic the sender does not
 * belong to — the id in a hidden field is a suggestion, and this does not read
 * suggestions.
 *
 * Written with the service role because `clinics` has no row-level policy
 * letting a clinic write its own row; only the internal team may. The
 * authorisation is the line above the write instead: role, and the clinic that
 * role belongs to.
 */
async function ownClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

export async function updatePreAppointmentHoldConfig(formData: FormData): Promise<void> {
  const autoExpires = String(formData.get('auto_expires')) === 'true'
  const clinicId = await ownClinicId()

  if (isDemo()) {
    writeClinicOverride(clinicId, { pre_appointment_auto_expires: autoExpires })
    // The store as well as the override bag: the demo's stand-in for
    // record_call reads the clinic row to decide whether a new pre-marcação
    // gets a deadline, exactly as the trigger does.
    const demoClinic = store.clinics.find((c) => c.id === clinicId)
    if (demoClinic) demoClinic.pre_appointment_auto_expires = autoExpires
    // The demo has no trigger to release the bookings already counting down, so
    // the same thing the real branch does below is done by hand. Without it the
    // demo would show the setting changing and the countdowns carrying on, and
    // the one thing this screen is for would look broken.
    if (!autoExpires) {
      for (const appointment of store.appointments) {
        if (appointment.clinic_id === clinicId && appointment.status === 'pendente') {
          appointment.expires_at = null
        }
      }
    }
    revalidatePath('/', 'layout')
    return
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ pre_appointment_auto_expires: autoExpires })
    .eq('id', clinicId)

  // Turning it off releases the bookings already counting down. Turning it on
  // does not retroactively put a clock on the ones waiting: the first choice
  // can only preserve a booking, the second could make a dozen of them lapse
  // within half an hour of a setting nobody thought was dangerous.
  if (!autoExpires) {
    await admin
      .from('appointments')
      .update({ expires_at: null })
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente')
  }

  // The countdown is drawn on the agenda, not only on this screen.
  revalidatePath('/', 'layout')
}

/**
 * Which languages Telma answers this clinic's calls in.
 *
 * The clinic edits its own, up to the number its plan includes. The count is
 * checked here so the reader gets a sentence instead of a Postgres error, and
 * again by the trigger on `clinics`, which is where the rule actually lives:
 * this action is not the only thing that writes to that table.
 *
 * The base language cannot be removed and is not read from the form. A clinic
 * that stopped speaking the language of the country it is in would leave every
 * caller who dialled expecting it with nobody to talk to.
 */
export async function updateClinicLanguages(
  codes: string[]
): Promise<{ ok: boolean; error?: string }> {
  const clinicId = await ownClinicId()
  const admin = createAdminClient()

  const { data: clinic } = await admin
    .from('clinics')
    .select('plan, language, selected_languages')
    .eq('id', clinicId)
    .maybeSingle()
  if (!clinic) return { ok: false, error: 'clinic' }

  const base = (clinic.language as string) ?? 'pt'
  const before: string[] = clinic.selected_languages ?? []

  const { data: available } = await admin
    .from('available_languages')
    .select('code')
    .eq('status', 'available')
  const sellable = new Set(((available ?? []) as Array<{ code: string }>).map((r) => r.code))

  const next = [base, ...codes.filter((c) => c !== base && sellable.has(c))]

  const { data: plan } = await admin
    .from('plans')
    .select('max_languages_included')
    .eq('id', clinic.plan)
    .maybeSingle()
  const max = (plan?.max_languages_included ?? null) as number | null

  if (max !== null && next.length > max) {
    return { ok: false, error: 'too_many' }
  }

  const { error } = await admin
    .from('clinics')
    .update({ selected_languages: next })
    .eq('id', clinicId)
  if (error) return { ok: false, error: error.message }

  // What changed, in words, so the internal team reading Atividade can see a
  // clinic add a language without diffing two arrays.
  const added = next.filter((c) => !before.includes(c))
  const removed = before.filter((c) => !next.includes(c))
  if (added.length || removed.length) {
    await admin.from('activity_log').insert({
      clinic_id: clinicId,
      type: 'languages_changed',
      message: [
        added.length ? `Idiomas adicionados: ${added.join(', ')}` : null,
        removed.length ? `Idiomas removidos: ${removed.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  revalidatePath('/conta')
  return { ok: true }
}

/**
 * What the account screen needs to draw the language section.
 *
 * One call rather than three from the page: the list, what is chosen, which one
 * cannot be removed, and how many the plan allows are four halves of the same
 * question, and fetching them separately is how they end up disagreeing.
 */
export async function clinicLanguageSettings(clinicId: string): Promise<{
  languages: Array<{ code: string; name: string; status: 'available' | 'coming_soon' | 'deprecated' }>
  selected: string[]
  base: string
  max: number | null
}> {
  if (isDemo()) {
    return {
      languages: [
        { code: 'pt', name: 'Português', status: 'available' },
        { code: 'es', name: 'Español', status: 'available' },
        { code: 'ca', name: 'Català', status: 'available' },
        { code: 'en', name: 'English', status: 'available' },
        { code: 'fr', name: 'Français', status: 'coming_soon' },
      ],
      selected: ['pt'],
      base: 'pt',
      max: 3,
    }
  }

  const admin = createAdminClient()
  const [{ data: clinic }, { data: rows }] = await Promise.all([
    admin
      .from('clinics')
      .select('plan, language, selected_languages')
      .eq('id', clinicId)
      .maybeSingle(),
    admin
      .from('available_languages')
      .select('code, name, status')
      .neq('status', 'deprecated')
      .order('sort_order', { ascending: true }),
  ])

  const base = ((clinic?.language as string) ?? 'pt') as string
  const { data: plan } = await admin
    .from('plans')
    .select('max_languages_included')
    .eq('id', clinic?.plan ?? 'essencial')
    .maybeSingle()

  return {
    languages: (rows ?? []) as Array<{
      code: string
      name: string
      status: 'available' | 'coming_soon' | 'deprecated'
    }>,
    selected: (clinic?.selected_languages as string[]) ?? [base],
    base,
    max: (plan?.max_languages_included ?? null) as number | null,
  }
}

/**
 * Everything the clinic told us, changed by the clinic.
 *
 * Until this existed the sign-up was a one-way door. A clinic that changed its
 * emergency number, added a treatment, moved premises or decided to stop being
 * formal had no way to say so: three writes existed against `clinics`, and they
 * were the brand colour, the logo, and the status Stripe sets when a card fails.
 * Everything Telma actually says was fixed at sign-up and could never be
 * corrected, which for an emergency number is not an inconvenience.
 *
 * The split is deliberate and it is the whole design. What the clinic supplied
 * is the clinic's, and it is all here. What makes Telma herself — how she
 * greets, that she confirms a name and a number, that she never gives clinical
 * advice, that an emergency outranks everything — is ours, versioned with the
 * application, and is not on this page or any other.
 *
 * Three things are edited elsewhere on purpose: the hours, because a timetable
 * needs a timetable's own screen; the languages, because the plan's ceiling and
 * what changing it costs belong beside the bill; and the number itself, which is
 * provisioned rather than typed.
 */
export async function updateClinicProfile(
  values: Record<string, unknown>,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const clinicId = await ownClinicId()
  const admin = createAdminClient()

  const { data: current } = await admin
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .maybeSingle()
  if (!current) return { ok: false, errors: { _form: 'clinic' } }

  // The sign-up's own schemas, not a second set written for this page. A rule
  // that exists in two places is a rule that will disagree with itself, and the
  // one that disagrees quietly is always the one nobody is looking at.
  const schemas = wizardSchemas(locale)
  const errors: Record<string, string> = {}
  const clean: Record<string, unknown> = {}

  for (const step of [2, 4, 5] as const) {
    const shape = schemas[step]
    // Languages stay as they are: they are edited on the account page, and
    // sending the current ones back through keeps step 5 satisfiable here.
    const input =
      step === 5
        ? {
            ...values,
            selected_languages: current.selected_languages ?? [current.language],
            greeting_language:
              values.greeting_language ?? current.language ?? 'pt',
          }
        : values
    const parsed = shape.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_form')
        if (!errors[key]) errors[key] = issue.message
      }
      continue
    }
    Object.assign(clean, parsed.data)
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const next = {
    name: clean.clinic_name,
    address: clean.address || null,
    phone: normalisePhone(String(clean.phone ?? '')) || null,
    specialty: clean.specialty,
    services: clean.services ?? [],
    custom_services: clean.custom_services || null,
    price_info: clean.price_info || null,
    appointment_duration_minutes: clean.appointment_duration_minutes,
    formality: clean.formality,
    fallback_policy: clean.fallback_policy,
    fallback_number: normalisePhone(String(clean.fallback_number ?? '')) || null,
    briefing: clean.briefing || null,
    emergency_number: normalisePhone(String(clean.emergency_number ?? '')) || null,
    emergency_protocol: clean.emergency_protocol || null,
    after_hours_transfer: clean.after_hours_transfer === true,
    after_hours_number: normalisePhone(String(clean.after_hours_number ?? '')) || null,
    after_hours_patients_only: clean.after_hours_patients_only !== false,
  }

  if (isDemo()) {
    writeClinicOverride(clinicId, next)
    const demoClinic = store.clinics.find((c) => c.id === clinicId)
    if (demoClinic) Object.assign(demoClinic, next)
    revalidatePath('/telma')
    return { ok: true }
  }

  const { error } = await admin.from('clinics').update(next).eq('id', clinicId)
  if (error) return { ok: false, errors: { _form: error.message } }

  // What changed, named. Turning off the patients-only filter on out-of-hours
  // calls, or moving the emergency number, are the kind of change somebody will
  // one day need to account for, and "the settings were saved" accounts for
  // nothing.
  const changed = Object.entries(next)
    .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((current as Record<string, unknown>)[k]))
    .map(([k]) => k)

  if (changed.length) {
    await admin.from('activity_log').insert({
      clinic_id: clinicId,
      type: 'clinic_updated',
      message: changed.join(', '),
      metadata: { fields: changed },
    })
  }

  revalidatePath('/telma')
  revalidatePath('/hoje')
  return { ok: true }
}
