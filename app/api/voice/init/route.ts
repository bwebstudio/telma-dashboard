import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import {
  countryOfRegion,
  serviceLabel,
  specialtyLabel,
  type Specialty,
} from '@/lib/onboarding/catalog'
import { voiceId } from '@/lib/onboarding/elevenlabs'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'
import {
  baseLanguageFor,
  buildPrompt,
  greetingLine,
  todayInZone,
  type PromptVariables,
} from '@/lib/onboarding/prompt'

/**
 * What the agent is told, at the moment a call arrives.
 *
 * This is the endpoint that makes one shared agent enough for every clinic.
 * ElevenLabs calls it before the first word is spoken, with the number that was
 * dialled, and takes back the system prompt, the opening line, the language and
 * the voice for that one conversation. Nothing is pasted into the agent by
 * hand, and changing a clinic's hours changes what Telma knows on the next call
 * rather than at the next deploy.
 *
 * The alternative was an agent per clinic, which does not survive five hundred
 * of them, or a prompt pasted per clinic, which is the same thing done by hand.
 *
 * Requires "Enable fetching conversation initiation data" in the agent's
 * Security tab, with prompt, first message, language and voice listed as
 * overridable. Without that ElevenLabs ignores what this returns, silently.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InitRequest {
  caller_id?: string
  agent_id?: string
  called_number?: string
  call_sid?: string
}

export async function POST(request: Request) {
  // Authentication is optional here and that is deliberate, not an oversight.
  // ElevenLabs does not always allow a custom header on this particular
  // webhook, so requiring one would mean the feature could not be switched on
  // at all. When TELMA_VOICE_INIT_TOKEN is set it is enforced; when it is not,
  // the endpoint is still safe to expose because it reveals nothing that is not
  // already read aloud to anyone who rings the number, and it writes nothing.
  const expected = process.env.TELMA_VOICE_INIT_TOKEN?.trim()
  if (expected) {
    const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (got !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  let body: InitRequest
  try {
    body = (await request.json()) as InitRequest
  } catch {
    body = {}
  }

  // The clinic is normally the one that owns the number that was dialled, and
  // there is no second way to find it: guessing would be one clinic answering
  // for another.
  //
  // The exception is the test console in ElevenLabs, which starts a real
  // conversation with a real voice but no phone call, and so sends no number.
  // TELMA_VOICE_INIT_TEST_CLINIC names the clinic to answer as in that case. It
  // is unset in production, where a call with no number is a call that cannot be
  // answered, and this whole branch disappears.
  const dialled = body.called_number?.trim()
  const testClinic = process.env.TELMA_VOICE_INIT_TEST_CLINIC?.trim()

  if (!dialled && !testClinic) {
    return NextResponse.json({ error: 'called_number_required' }, { status: 400 })
  }

  const clinicId = dialled ? await clinicIdByPhone(dialled) : (testClinic as string)
  if (!clinicId) {
    // A number nobody owns. Answering with somebody else's clinic would put one
    // clinic's patients in another clinic's diary, so this refuses instead and
    // the agent falls back to whatever it was configured with.
    return NextResponse.json({ error: 'clinic_not_found_for_number' }, { status: 404 })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })

  const { clinic, minutes } = context
  const promptLocale = isOnboardingLocale(clinic.language)
    ? clinic.language
    : DEFAULT_ONBOARDING_LOCALE

  const hours = await openingHours(clinicId)
  const languageNames = await languageLabels(
    clinic.selected_languages?.length ? clinic.selected_languages : [promptLocale],
    promptLocale
  )

  const baseLanguage = baseLanguageFor(
    promptLocale,
    clinic.region ? countryOfRegion(clinic.region) : null
  )

  const { data: diaries } = await createAdminClient()
    .from('resources')
    .select('name')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .order('sort')
    .order('created_at')

  const variables: PromptVariables = {
    clinic_name: clinic.name,
    // Only when there is more than one. A clinic with a single diary carries
    // the clinic's own name there, and telling Telma about "the professionals"
    // of a one-person clinic invents a choice the caller does not have.
    professionals: ((diaries ?? []) as Array<{ name: string }>).map((r) => r.name),
    // Where an emergency goes, and the only thing about a clinic that changes it.
    caller_id: body.caller_id?.trim() || null,
    veterinary: clinic.specialty === 'veterinaria',
    specialty: clinic.specialty ? specialtyLabel(clinic.specialty as Specialty, promptLocale) : null,
    address: clinic.address ?? null,
    phone: clinic.phone ?? null,
    timezone: clinic.timezone,
    // With its length, where the clinic set one. She does not need this to book
    // (the diary already leaves the right gap) but she is asked how long things
    // take, and the alternative was the honest but useless "the clinic will
    // tell you" about a number the clinic has already written down.
    services: [
      ...(clinic.services ?? []),
      ...String(clinic.custom_services ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ].map((id) => {
      const label = serviceLabel(id, promptLocale)
      const minutes = clinic.service_durations?.[id]
      const price = clinic.service_prices?.[id]
      const notes = [
        minutes ? `${minutes} min` : null,
        // Euros written out rather than symbol-first, because this is read
        // aloud and "40 euros" is what a person says.
        price != null ? `${formatEuros(price, promptLocale)}` : null,
      ].filter(Boolean)
      return notes.length ? `${label} (${notes.join(', ')})` : label
    }),
    // Already folded into `services` above, each with its own length and price,
    // so repeating the raw list here would have Telma read the same treatments
    // twice, once priced and once not.
    custom_services: null,
    opening_hours: hours.map((h) => `${weekdayName(h.weekday, promptLocale)}: ${h.opens}-${h.closes}`),
    appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
    languages: languageNames,
    formality: (clinic.formality as 'formal' | 'informal') ?? 'formal',
    price_info: clinic.price_info ?? null,
    fallback_policy: (clinic.fallback_policy as 'transfer' | 'message' | 'callback') ?? 'message',
    fallback_number: clinic.fallback_number ?? null,
    briefing: clinic.briefing ?? null,
    can_book: clinic.status === 'ativa' && !minutes.exhausted,
    within_opening_hours: isOpenNow(hours, clinic.timezone),
    emergency_number: clinic.emergency_number ?? null,
    emergency_protocol: clinic.emergency_protocol ?? null,
    recording: clinic.calls_recorded ?? true,
    after_hours_transfer: clinic.after_hours_transfer === true,
    after_hours_patients_only: clinic.after_hours_patients_only !== false,
    after_hours_number: clinic.after_hours_number ?? null,
    today: todayInZone(clinic.timezone, baseLanguage),
  }

  const built = buildPrompt(variables, baseLanguage)

  return NextResponse.json({
    type: 'conversation_initiation_client_data',
    conversation_config_override: {
      agent: {
        prompt: { prompt: built.text },
        // The opening line, authored rather than improvised, so the recording
        // notice is always in it and always in the right language.
        first_message: greetingLine(
          clinic.name,
          promptLocale,
          variables.formality,
          variables.recording,
          // Every language this clinic answers in. With more than one, the
          // greeting offers them, each said in its own language, and the choice
          // is made once at the start instead of guessed at mid-call.
          clinic.selected_languages?.length ? clinic.selected_languages : [promptLocale]
        ),
        language: promptLocale,
      },
      // No voice override, deliberately.
      //
      // Pinning one here fixes it for the whole conversation, which quietly
      // undoes language switching: a Spanish clinic opened with the Spanish
      // voice, somebody asked for Portuguese, the language changed and the voice
      // did not. What came out was a Spanish woman speaking Portuguese, which is
      // more noticeable than the accent this was all meant to avoid.
      //
      // The agent carries a voice per language instead, so opening in Spanish
      // picks the Spanish one and moving to Portuguese moves the voice with it.
      // `voiceId()` is still what the sign-up preview speaks with, where there is
      // no conversation and nothing to switch.
    },
    // What the tools need. `clinic_id` is the important one: every other
    // endpoint takes it, and this is the only place it can come from.
    dynamic_variables: {
      clinic_id: clinicId,
      clinic_name: clinic.name,
      clinic_timezone: clinic.timezone,
      clinic_language: promptLocale,
      can_book: String(variables.can_book),
      prompt_version: built.version,
      // Read by the built-in transfer tool, which needs a number and cannot be
      // given one per clinic any other way: there is a single shared agent, so
      // the destination has to arrive with the call.
      //
      // Empty string rather than null when the clinic named nobody. The tool
      // then has nothing to dial, which is correct: a clinic that gave no number
      // must not have its main line rung by an agent improvising.
      fallback_number: variables.fallback_number ?? clinic.phone ?? '',
      emergency_number: variables.emergency_number ?? '',
    },
  })
}

// Helpers ---------------------------------------------------------------------
// Duplicated from /api/clinic-context on purpose: that endpoint answers a
// different question for a different caller, and coupling the two would mean a
// change for the agent's benefit could break the panel's.

async function clinicIdByPhone(raw: string): Promise<string | null> {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 8) return null
  const candidates = digits.startsWith('00') ? [digits.slice(2), digits] : [digits, `00${digits}`]

  const admin = createAdminClient()
  for (const candidate of candidates) {
    const { data } = await admin
      .from('clinics')
      .select('id')
      .eq('assigned_phone_digits', candidate)
      .maybeSingle()
    if (data?.id) return data.id as string
  }
  return null
}

async function openingHours(
  clinicId: string
): Promise<Array<{ weekday: number; opens: string; closes: string }>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('availability_slots')
    .select('weekday, start_time, end_time')
    .eq('clinic_id', clinicId)
    .eq('active', true)

  const rows = (data ?? []) as Array<{ weekday: number; start_time: string; end_time: string }>
  const byDay = new Map<number, { opens: string; closes: string }>()
  for (const r of rows) {
    const cur = byDay.get(r.weekday)
    if (!cur) {
      byDay.set(r.weekday, { opens: r.start_time, closes: r.end_time })
      continue
    }
    if (r.start_time < cur.opens) cur.opens = r.start_time
    if (r.end_time > cur.closes) cur.closes = r.end_time
  }
  return [...byDay.entries()]
    .map(([weekday, v]) => ({ weekday, opens: v.opens.slice(0, 5), closes: v.closes.slice(0, 5) }))
    .sort((a, b) => a.weekday - b.weekday)
}

function isOpenNow(
  hours: Array<{ weekday: number; opens: string; closes: string }>,
  timezone: string
): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  if (weekday < 0) return false
  const hhmm = `${get('hour')}:${get('minute')}`
  return hours.some((h) => h.weekday === weekday && hhmm >= h.opens && hhmm < h.closes)
}

async function languageLabels(codes: string[], locale: 'pt' | 'es'): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('available_languages')
    .select('code, name_pt, name_es')
    .in('code', codes)
  const rows = (data ?? []) as Array<{ code: string; name_pt: string; name_es: string }>
  const byCode = new Map(rows.map((r) => [r.code, locale === 'es' ? r.name_es : r.name_pt]))
  return codes.map((c) => byCode.get(c) ?? c)
}

const WEEKDAYS: Record<'pt' | 'es', string[]> = {
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
}

function weekdayName(weekday: number, locale: 'pt' | 'es'): string {
  return WEEKDAYS[locale][weekday] ?? String(weekday)
}

/** "40 €" for a whole number, "39,50 €" when there are cents. Written the way
 *  the country writes it, because the base is read aloud. */
function formatEuros(value: number, locale: 'pt' | 'es'): string {
  const whole = Number.isInteger(value)
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}
