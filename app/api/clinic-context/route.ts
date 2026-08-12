import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  countryOfRegion,
  serviceLabel,
  specialtyLabel,
  type Specialty,
} from '@/lib/onboarding/catalog'
import { isOnboardingLocale, DEFAULT_ONBOARDING_LOCALE } from '@/lib/onboarding/locale'
import {
  baseLanguageFor,
  buildPrompt,
  todayInZone,
  type PromptVariables,
} from '@/lib/onboarding/prompt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/clinic-context?clinic_id=...
//     /api/clinic-context?phone=%2B34936014505
//
// Everything the voice agent needs before it answers: whose clinic this is, in
// which zone, what it may talk about, and whether there are minutes left to
// talk with. One call at the start of a conversation instead of four.
//
// This is what makes one generic agent enough. Everything that would otherwise
// have to be baked into a per-specialty prompt is data, and it is served from
// here: what the clinic does, what it may book, in what language, and when it
// is open. A dental clinic and a construction company get the same agent and a
// different answer to this call.
//
// The response is a curated shape, not the clinic row. What the agent is given
// is what it needs to speak; the Stripe ids and the contact email stay on the
// server, where a prompt injection cannot read them back out loud.
export async function GET(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Two ways in, and the second is the one real telephony needs. A call
  // arriving at a number carries the number, not our id for the clinic behind
  // it: nothing in the voice platform knows what a `clinic_id` is until we tell
  // it, and we cannot tell it before the call exists.
  const params = new URL(request.url).searchParams
  const byPhone = params.get('phone') ?? params.get('to')
  let clinicId = params.get('clinic_id')

  if (!clinicId && byPhone) {
    clinicId = await clinicIdByPhone(byPhone)
    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_not_found_for_phone' }, { status: 404 })
    }
  }

  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id_or_phone_required' }, { status: 400 })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }

  const { clinic, plan, minutes, addons, capabilities } = context

  const promptLocale = isOnboardingLocale(clinic.language)
    ? clinic.language
    : DEFAULT_ONBOARDING_LOCALE

  const hours = await openingHours(clinicId)
  const languageNames = await languageLabels(
    clinic.selected_languages ?? [clinic.language ?? DEFAULT_ONBOARDING_LOCALE],
    promptLocale
  )

  const baseLanguage = baseLanguageFor(
    clinic.language ?? DEFAULT_ONBOARDING_LOCALE,
    clinic.region ? countryOfRegion(clinic.region) : null
  )

  // The receptionist's whole briefing, assembled here rather than in the voice
  // platform. Two shapes on purpose: `text` for an integration that overrides
  // the agent's system prompt, `variables` for one that would rather keep the
  // template on its side. Serving both means the integration can change its
  // mind without this endpoint changing.
  const variables: PromptVariables = {
    clinic_name: clinic.name,
    professionals: [],
    veterinary: clinic.specialty === 'veterinaria',
    specialty: clinic.specialty
      ? specialtyLabel(clinic.specialty as Specialty, promptLocale)
      : null,
    address: clinic.address ?? null,
    phone: clinic.phone ?? null,
    timezone: clinic.timezone,
    services: (clinic.services ?? []).map((id) => serviceLabel(id, promptLocale)),
    custom_services: clinic.custom_services ?? null,
    opening_hours: hours.map((h) => `${weekdayName(h.weekday, promptLocale)}: ${h.opens}-${h.closes}`),
    appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
    languages: languageNames,
    formality: (clinic.formality as 'formal' | 'informal') ?? 'formal',
    price_info: clinic.price_info ?? null,
    fallback_policy:
      (clinic.fallback_policy as 'transfer' | 'message' | 'callback') ?? 'message',
    fallback_number: clinic.fallback_number ?? null,
    briefing: clinic.briefing ?? null,
    can_book: clinic.status === 'ativa' && !minutes.exhausted,
    // Whether the clinic is open right now, in its own timezone. This is what
    // makes the emergency block able to say something true: inside hours there
    // is somebody to transfer to, outside there is not.
    within_opening_hours: isOpenNow(hours, clinic.timezone),
    emergency_number: clinic.emergency_number ?? null,
    emergency_protocol: clinic.emergency_protocol ?? null,
    recording: clinic.calls_recorded ?? true,
    after_hours_transfer: clinic.after_hours_transfer === true,
    after_hours_patients_only: clinic.after_hours_patients_only !== false,
    after_hours_number: clinic.after_hours_number ?? null,
    today: todayInZone(clinic.timezone, baseLanguage),
  }

  const prompt = buildPrompt(variables, baseLanguage)

  return NextResponse.json({
    clinic: {
      id: clinic.id,
      name: clinic.name,
      status: clinic.status,
      timezone: clinic.timezone,
      phone: clinic.phone,
      address: clinic.address,
      assigned_phone: clinic.assigned_phone,
      voice_agent_id: clinic.voice_agent_id,
      voice_id: clinic.voice_id ?? null,
      voice_name: clinic.voice_name,
      // The clinic's base language, which it cannot remove.
      language: clinic.language ?? DEFAULT_ONBOARDING_LOCALE,
      // Every language it may answer in. The agent detects the caller's and
      // replies in it, but only from this list: answering in a language the
      // clinic never bought is a promise its staff cannot keep when the call is
      // transferred to a person.
      languages: clinic.selected_languages?.length
        ? clinic.selected_languages
        : [clinic.language ?? DEFAULT_ONBOARDING_LOCALE],
    },

    // What the prompt is built from -----------------------------------------
    // Labels, not ids. `dent_limpeza` means nothing said out loud, and asking
    // the agent to hold the mapping would put a second copy of the catalogue
    // somewhere it cannot be kept in step.
    business: {
      specialty: clinic.specialty ?? null,
      specialty_label: clinic.specialty
        ? specialtyLabel(clinic.specialty as Specialty, promptLocale)
        : null,
      services: (clinic.services ?? []).map((id) => serviceLabel(id, promptLocale)),
      // Free text the clinic wrote itself. For anything outside the four
      // specialties this is the only description that exists, so it is served
      // verbatim and never summarised.
      custom_services: clinic.custom_services ?? null,
      appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
      min_interval_minutes: clinic.min_interval_minutes ?? 30,
      opening_hours: hours,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      max_minutes_per_month: plan.max_minutes_per_month,
      max_locations: plan.max_locations,
      max_concurrent_calls: plan.max_concurrent_calls,
      billing_cycle: clinic.billing_cycle ?? 'monthly',
      renews_at: clinic.plan_renews_at ?? null,
    },
    minutes,
    addons,
    capabilities,
    // The two questions the agent actually asks. Answered here so the rule
    // lives on the server and not in a prompt: a paused clinic takes no
    // bookings, and a clinic out of minutes should be wrapping up, not opening
    // a new conversation.
    can_book: clinic.status === 'ativa' && !minutes.exhausted,
    is_active: clinic.status === 'ativa',

    // One agent serves every clinic. This is what makes it this clinic's.
    prompt,
  })
}

/**
 * When the clinic is open, in a shape a sentence can be built from.
 *
 * Derived from `availability_slots` rather than stored a second time: those
 * rows are what the agent will actually be able to offer, so a summary read
 * from anywhere else could promise an hour the diary does not have.
 *
 * One entry per weekday it is open, with the first start and the last end.
 * Lunch is visible as the gap between slots and is deliberately not described
 * here: the agent should be offering times from /api/availability, not
 * reasoning about breaks from prose.
 */
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
    const current = byDay.get(r.weekday)
    if (!current) {
      byDay.set(r.weekday, { opens: r.start_time, closes: r.end_time })
      continue
    }
    if (r.start_time < current.opens) current.opens = r.start_time
    if (r.end_time > current.closes) current.closes = r.end_time
  }

  return [...byDay.entries()]
    .map(([weekday, v]) => ({ weekday, opens: v.opens.slice(0, 5), closes: v.closes.slice(0, 5) }))
    .sort((a, b) => a.weekday - b.weekday)
}

/** Language names as the prompt should read them, from the catalogue. */
async function languageLabels(codes: string[], locale: 'pt' | 'es'): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('available_languages')
    .select('code, name_pt, name_es')
    .in('code', codes)

  const rows = (data ?? []) as Array<{ code: string; name_pt: string; name_es: string }>
  const byCode = new Map(rows.map((r) => [r.code, locale === 'es' ? r.name_es : r.name_pt]))
  // Preserve the clinic's own order: the first is the one Telma greets in.
  return codes.map((c) => byCode.get(c) ?? c)
}

const WEEKDAYS: Record<'pt' | 'es', string[]> = {
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
}

function weekdayName(weekday: number, locale: 'pt' | 'es'): string {
  return WEEKDAYS[locale][weekday] ?? String(weekday)
}

/**
 * Is the clinic open at this moment, by its own clock?
 *
 * The clinic's timezone and not the server's. Vercel runs in UTC, Lisbon is an
 * hour off it for half the year and Madrid two, so a call at half past nine in
 * Barcelona is half past seven here. Getting this wrong would tell Telma the
 * clinic is closed while somebody is sitting at the desk, and the emergency
 * block would read out an out-of-hours instruction to a caller who could have
 * been put straight through.
 */
function isOpenNow(
  hours: Array<{ weekday: number; opens: string; closes: string }>,
  timezone: string
): boolean {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  if (weekday < 0) return false

  const hhmm = `${get('hour')}:${get('minute')}`
  // The gap for lunch is not consulted: a clinic with somebody at the desk over
  // lunch should still take an emergency, and the alternative reading would send
  // a bleeding patient to A&E at one o'clock on a Tuesday.
  return hours.some((h) => h.weekday === weekday && hhmm >= h.opens && hhmm < h.closes)
}

/**
 * Which clinic answers on this number.
 *
 * `assigned_phone` is always stored in E.164, so an exact match is the whole
 * lookup once the incoming value is normalised. Normalising matters: a platform
 * may hand over `+34 936 014 505`, `0034936014505` or `34936014505` for the same
 * line, and three spellings of one number would be three misses.
 *
 * Returns null rather than guessing. A call to a number we do not recognise is
 * a misconfiguration somewhere, and answering with somebody else's clinic would
 * put one clinic's patients in another clinic's diary.
 */
async function clinicIdByPhone(raw: string): Promise<string | null> {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 8) return null

  // `00` is how a keypad writes `+`, and some carriers pass it through. Both
  // spellings are tried because either can arrive for the same line.
  const candidates = digits.startsWith('00')
    ? [digits.slice(2), digits]
    : [digits, `00${digits}`]

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
