import { isOpenNow, openingHours, spansText } from '@/lib/opening-hours'
import { createAdminClient } from '@/lib/supabase/admin'
import { announcesRecording } from '@/lib/recording'
import {
  countryOfRegion,
  serviceLabel,
  specialtyLabel,
  type Specialty,
} from '@/lib/onboarding/catalog'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'
import { baseLanguageFor, todayInZone, type BaseLanguage, type PromptVariables } from '@/lib/onboarding/prompt'
import type { Clinic } from '@/lib/types'

/**
 * Everything Telma is told about one clinic, for one conversation.
 *
 * ── WHY THIS IS NOT IN THE ROUTE ANY MORE ──────────────────────────────────
 * It was, and it was the only copy, which was right while the telephone was
 * the only way in. WhatsApp is a second way in and needs the same facts: the
 * same hours, the same services with their prices, the same briefing, the same
 * fallback policy. A second copy of this mapping in the WhatsApp handler is a
 * copy that drifts, and the shape of that drift is a clinic whose Telma says
 * one thing on the telephone and another in writing.
 *
 * So it lives here and both doors call it. `scripts/spanish-demo-agent.mjs`
 * already learned this the other way round: it asks /api/voice/init for the
 * prompt rather than rebuilding it, because "a second copy of this mapping
 * would drift, and the clip would be of a Telma nobody sells".
 */
export interface VariablesFor {
  clinicId: string
  clinic: Clinic
  /** Whether the plan's minutes are spent. Decided by the caller, which has
   *  already read the plan. */
  minutesExhausted: boolean
  /** The number the conversation comes from, where there is one. On the
   *  telephone the network says it; on WhatsApp the message does. */
  callerId?: string | null
  /** Which way in this is. It changes what she is told about how to speak and
   *  nothing about the clinic. */
  channel?: 'telefone' | 'whatsapp'
}

export interface BuiltVariables {
  variables: PromptVariables
  baseLanguage: BaseLanguage
  /** The language she greets in, which is the clinic's and not always the
   *  base's: a Catalan clinic is greeted in Catalan and the sheet is Spanish. */
  promptLocale: 'pt' | 'es'
  /** Whether the clinic is open as this is read. The caller needs it too. */
  openNow: boolean
}

export async function promptVariablesFor(input: VariablesFor): Promise<BuiltVariables> {
  const { clinicId, clinic } = input
  const minutes = { exhausted: input.minutesExhausted }
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

  // ── DOES THIS CLINIC ALREADY KNOW THIS NUMBER? ────────────────────────────
  // One query, keyed on the last nine digits the same way everything else that
  // matches a telephone is. The answer only ever removes a question: a clinic
  // that already has this person's contact number does not have to be given it
  // again. The name is read but never spoken -- see `knownPatient` in the base.
  //
  // ── AND A NUMBER CAN NOW BE SEVERAL PEOPLE ────────────────────────────────
  // Since 0049 a household shares a record per person on one handset. This asked
  // for a single row and got an error instead of an answer the moment there were
  // two, so a family was silently demoted to a stranger and asked for the number
  // it had already given. Most recently heard from, limit one.
  //
  // Which of them it is does not matter here, and that is the point: the only
  // thing the prompt does with this is decide whether to ask for the number. The
  // name never reaches it, and who is actually speaking is a question Telma
  // still asks out loud, because with a household on one handset it is the
  // question that matters.
  const callerDigits = (input.callerId ?? '').replace(/\D/g, '').slice(-9)
  let knownPatient: string | null = null
  if (callerDigits.length === 9) {
    const { data: found } = await createAdminClient()
      .from('patients')
      .select('name')
      .eq('clinic_id', clinicId)
      // Their main number, or one they have rung from before and that survived
      // a merge. Missing the second kind would undo every merge on the next
      // call from the other telephone.
      .or(`phone_digits.eq.${callerDigits},other_digits.cs.{${callerDigits}}`)
      .order('last_seen_at', { ascending: false })
      .limit(1)
    knownPatient = (found as Array<{ name: string }> | null)?.[0]?.name ?? null
  }

  const variables: PromptVariables = {
    clinic_name: clinic.name,
    // Only when there is more than one. A clinic with a single diary carries
    // the clinic's own name there, and telling Telma about "the professionals"
    // of a one-person clinic invents a choice the caller does not have.
    professionals: ((diaries ?? []) as Array<{ name: string }>).map((r) => r.name),
    // Where an emergency goes, and the only thing about a clinic that changes it.
    caller_id: input.callerId?.trim() || null,
    known_patient: knownPatient,
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
    opening_hours: hours.map((h) => `${weekdayName(h.weekday, promptLocale)}: ${spansText(h)}`),
    appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
    languages: languageNames,
    formality: (clinic.formality as 'formal' | 'informal') ?? 'formal',
    price_info: clinic.price_info ?? null,
    // Anything that is not a transfer is the one other answer there is: take
    // the message and ring them back. 'callback' is a row written before the
    // two were merged, and it means exactly that.
    fallback_policy: clinic.fallback_policy === 'transfer' ? 'transfer' : 'message',
    fallback_number: clinic.fallback_number ?? null,
    briefing: clinic.briefing ?? null,
    // Three reasons she cannot book today, and one that is not about today:
    // a clinic that told us it does not want her booking at all. See 0076.
    can_book:
      clinic.status === 'ativa' && !minutes.exhausted && clinic.takes_bookings !== false,
    takes_bookings: clinic.takes_bookings !== false,
    within_opening_hours: isOpenNow(hours, clinic.timezone),
    emergency_number: clinic.emergency_number ?? null,
    emergency_protocol: clinic.emergency_protocol ?? null,
    // The sentence and the audio move together. See lib/recording.
    recording: announcesRecording(clinic),
    // Changes what she says when she closes a booking. See 0064.
    appointments_auto_confirmed: clinic.appointments_auto_confirmed ?? false,
    after_hours_transfer: clinic.after_hours_transfer === true,
    after_hours_patients_only: clinic.after_hours_patients_only !== false,
    after_hours_number: clinic.after_hours_number ?? null,
    today: todayInZone(clinic.timezone, baseLanguage),
  }


  return {
    variables,
    baseLanguage,
    promptLocale,
    openNow: variables.within_opening_hours,
  }
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
