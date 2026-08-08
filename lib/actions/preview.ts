'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { serviceLabel, specialtyLabel, TIMEZONE, countryOfRegion, type Specialty } from '@/lib/onboarding/catalog'
import { speak, voiceId } from '@/lib/onboarding/elevenlabs'
import { DEFAULT_ONBOARDING_LOCALE, type OnboardingLocale } from '@/lib/onboarding/locale'
import {
  baseLanguageFor,
  buildPrompt,
  greetingLine,
  todayInZone,
  type PromptVariables,
} from '@/lib/onboarding/prompt'
import { buildSlots } from '@/lib/onboarding/schedule'

/**
 * Showing a clinic the receptionist it just trained.
 *
 * Before this, somebody filled in eight fields and never saw what they produced.
 * They ticked "formal", left the price box empty and typed a note about parking,
 * and the first time anyone read the result was when a patient rang. Two of
 * those are decisions taken by omission — an empty price box means "do not
 * discuss prices", an empty emergency number means "send them to A&E" — and a
 * decision nobody sees is a decision nobody can correct.
 *
 * `buildPrompt` is pure, which is what makes this possible: the same function
 * that feeds the voice platform renders the preview, so what the clinic reads is
 * what the agent gets. A preview assembled separately would drift, and it would
 * drift in the direction of looking better than the truth.
 */

export interface PromptPreview {
  text: string
  version: string
  /** The line Telma opens with, which is also what gets spoken. */
  greeting: string
  /** The language code Telma greets in. Decides the voice, and so the accent. */
  greetingLanguage: string
  /** The language the prompt itself is written in. */
  baseLanguage: 'pt' | 'es'
  /** True when the clinic is currently within its own opening hours. The
   *  emergency block reads differently either side of that, so the preview says
   *  which one it is showing. */
  openNow: boolean
}

type Values = Record<string, unknown>

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

/**
 * Builds the prompt from a half-finished wizard, not from a clinic row.
 *
 * Everything is optional here because the reader is mid-form: they are on step
 * 5 and step 6 has not happened. Missing answers become the same defaults the
 * sign-up would apply, so the preview shows what would be created if they
 * stopped now, rather than an error.
 */
export async function previewPrompt(
  values: Values,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<PromptPreview> {
  const specialty = str(values.specialty) as Specialty | null
  const region = str(values.region) ?? ''
  const timezone = region ? TIMEZONE[countryOfRegion(region)] : 'Europe/Lisbon'
  const clinicName = str(values.clinic_name) ?? (locale === 'es' ? 'su clínica' : 'a sua clínica')

  const languageCodes = Array.isArray(values.selected_languages)
    ? (values.selected_languages as string[])
    : [locale]
  const greetingCode = str(values.greeting_language) ?? languageCodes[0] ?? locale
  const languageNames = await languageNamesFor(languageCodes, greetingCode, locale)

  const formality = values.formality === 'informal' ? 'informal' : 'formal'
  const recording = values.calls_recorded !== false

  // The hours, through the same generator the sign-up uses, so the preview
  // cannot show a timetable the diary would not produce.
  const hours = openingHoursFrom(values, locale)

  const variables: PromptVariables = {
    clinic_name: clinicName,
    specialty: specialty ? specialtyLabel(specialty, locale) : null,
    address: str(values.address),
    phone: str(values.phone),
    timezone,
    services: Array.isArray(values.services)
      ? (values.services as string[]).map((id) => serviceLabel(id, locale))
      : [],
    custom_services: str(values.custom_services),
    opening_hours: hours.lines,
    appointment_duration_minutes: Number(values.appointment_duration_minutes) || 30,
    languages: languageNames,
    formality,
    price_info: str(values.price_info),
    fallback_policy:
      values.fallback_policy === 'transfer' || values.fallback_policy === 'callback'
        ? values.fallback_policy
        : 'message',
    fallback_number: str(values.fallback_number),
    briefing: str(values.briefing),
    // The preview always shows the clinic able to book. It is the state it will
    // be in on day one, and showing the out-of-minutes version to somebody who
    // has not paid yet would be answering a question they did not ask.
    can_book: true,
    within_opening_hours: hours.openNow,
    emergency_number: str(values.emergency_number),
    emergency_protocol: str(values.emergency_protocol),
    recording,
    // The preview shows the safe default, which is also what a new clinic gets:
    // nobody is rung at night until somebody says yes on purpose.
    after_hours_transfer: values.after_hours_transfer === true,
    after_hours_patients_only: values.after_hours_patients_only !== false,
    after_hours_number: str(values.after_hours_number),
    // The preview has a today too: it is what the clinic would get if a call
    // came in while they are reading it.
    today: todayInZone(timezone, baseLanguageFor(greetingCode, countryOfRegion(region))),
  }

  // The base is written in the language the clinic greets in, so the text it is
  // shown is a text it can read and correct.
  const built = buildPrompt(variables, baseLanguageFor(greetingCode, countryOfRegion(region)))
  return {
    text: built.text,
    version: built.version,
    greeting: greetingLine(clinicName, greetingCode, formality, recording),
    greetingLanguage: greetingCode,
    baseLanguage: built.base_language,
    openNow: hours.openNow,
  }
}

export type GreetingAudio =
  | { ok: true; audio: string; mimeType: string; text: string }
  | { ok: false; reason: 'no_key' | 'no_permission' | 'failed' | 'no_voice'; detail?: string }

/**
 * The greeting, out loud, in the voice the clinic picked.
 *
 * The only thing in the sign-up that spends ElevenLabs credits, which is why it
 * runs on a click and not on a keystroke. One sentence: enough to hear the voice
 * and the wording, cheap enough to press a few times while choosing.
 */
export async function previewGreetingAudio(
  values: Values,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<GreetingAudio> {
  // The voice follows the language Telma greets in, which is what the clinic
  // picked on this same step. Preview it as it will actually sound.
  const { greeting, greetingLanguage } = await previewPrompt(values, locale)
  const voice = voiceId(greetingLanguage)
  if (!voice) return { ok: false, reason: 'no_voice' }
  const result = await speak(voice, greeting)
  return result.ok
    ? { ok: true, audio: result.audio, mimeType: result.mimeType, text: greeting }
    : { ok: false, reason: result.reason, detail: result.detail }
}

// Helpers ---------------------------------------------------------------------

const WEEKDAYS: Record<OnboardingLocale, string[]> = {
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
}

function openingHoursFrom(
  values: Values,
  locale: OnboardingLocale
): { lines: string[]; openNow: boolean } {
  const schedule = {
    weekdays: values.weekdays,
    saturday: values.saturday,
    sunday: values.sunday,
    pause: values.pause,
    appointment_duration_minutes: Number(values.appointment_duration_minutes) || 30,
    min_interval_minutes: Number(values.min_interval_minutes) || 30,
  }

  let slots: ReturnType<typeof buildSlots> = []
  try {
    slots = buildSlots(schedule as never)
  } catch {
    // A half-answered step 3. The preview shows no hours rather than failing:
    // the reader is on step 5 and has not necessarily been back to fix it.
    return { lines: [], openNow: true }
  }

  const byDay = new Map<number, { opens: string; closes: string }>()
  for (const s of slots) {
    const cur = byDay.get(s.weekday)
    if (!cur) {
      byDay.set(s.weekday, { opens: s.start_time, closes: s.end_time })
      continue
    }
    if (s.start_time < cur.opens) cur.opens = s.start_time
    if (s.end_time > cur.closes) cur.closes = s.end_time
  }

  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0])
  const now = new Date()
  const today = now.getDay()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const openNow = days.some(
    ([w, v]) => w === today && hhmm >= v.opens.slice(0, 5) && hhmm < v.closes.slice(0, 5)
  )

  return {
    lines: days.map(
      ([w, v]) => `${WEEKDAYS[locale][w]}: ${v.opens.slice(0, 5)}-${v.closes.slice(0, 5)}`
    ),
    openNow,
  }
}

/** Language names from the catalogue, greeting language first. */
async function languageNamesFor(
  codes: string[],
  greetingCode: string,
  locale: OnboardingLocale
): Promise<string[]> {
  const ordered = [greetingCode, ...codes.filter((c) => c !== greetingCode)]

  if (isDemo()) {
    const demo: Record<string, string> = { pt: 'Português', es: 'Español', ca: 'Català', en: 'English' }
    return ordered.map((c) => demo[c] ?? c)
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('available_languages')
    .select('code, name_pt, name_es')
    .in('code', ordered)

  const rows = (data ?? []) as Array<{ code: string; name_pt: string; name_es: string }>
  const byCode = new Map(rows.map((r) => [r.code, locale === 'es' ? r.name_es : r.name_pt]))
  return ordered.map((c) => byCode.get(c) ?? c)
}
