/**
 * What the patient is told, and nothing about how it is sent.
 *
 * ── NO IMPORTS ─────────────────────────────────────────────────────────────
 * Deliberate, the same way lib/onboarding/prompt.ts is: this is the part worth
 * reading in a test, and a test that needs a database in order to check a
 * sentence is a test nobody runs. Everything touching Twilio or Supabase lives
 * in notify-patient.ts.
 *
 * These are read by somebody who asked for an appointment out loud days ago and
 * is now looking at their telephone. The clinic's name comes first, because
 * that is what makes it not spam; then what happened; then what to do about it.
 * No link, no reference number, no "reply STOP": the sender is the clinic's own
 * line, so replying and calling back both reach the clinic.
 */

export type NotifyKind = 'confirmada' | 'alterada' | 'rejeitada'

/** Only what a message needs. Narrower than `Clinic` on purpose: this module
 *  imports nothing, and a message does not depend on a plan or a phone. */
export interface NotifiableClinic {
  name: string
  timezone: string
  language?: string | null
  /** The line the patient should ring. Only written into the message when the
   *  sender is a name rather than a number — see `withPhone`. */
  assigned_phone?: string | null
}

/**
 * The clinic's name as a sender, when its own number cannot carry an SMS.
 *
 * Portuguese voice numbers mostly cannot: Twilio answered "'From' number
 * +351300602615 is not SMS-capable". An alphanumeric sender is the way round
 * it and Portugal takes one without registering it first.
 *
 * Eleven characters, at least one letter, and no accents -- Twilio's rules, not
 * ours. The generic half of a clinic's name is dropped because "Clínica De" is
 * not a sender anybody recognises and "Sorriso" is.
 */
const GENERIC = new Set([
  'clinica', 'clinicas', 'centro', 'consultorio', 'dental', 'dentaria', 'dentario',
  'medico', 'medica', 'veterinaria', 'veterinario', 'estetica', 'de', 'da', 'do', 'y', 'e',
])

export function senderIdFor(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const distinctive = words.filter((w) => !GENERIC.has(w.toLowerCase()))
  // Joined rather than just the first word: "Dra Ruiz" is a sender and "Dra"
  // is not. Spaces are allowed, and eleven characters is the ceiling.
  const pick = (distinctive.length ? distinctive : words).join(' ').slice(0, 11).trim()
  if (!pick) return 'Clinica'
  // Twilio refuses a sender made only of digits.
  return /[A-Za-z]/.test(pick) ? pick : `C${pick}`.slice(0, 11)
}

const COPY = {
  pt: {
    confirmada: (c: string, w: string) =>
      `${c}: a sua marcação está confirmada para ${w}. Se não puder vir, ligue-nos.`,
    alterada: (c: string, w: string) =>
      `${c}: a sua marcação passou para ${w}. Se este horário não lhe der jeito, ligue-nos.`,
    rejeitada: (c: string, w: string, why: string | null) =>
      `${c}: não foi possível confirmar a sua marcação de ${w}${why ? `. ${why}` : ''}. Ligue-nos para remarcar.`,
  },
  es: {
    confirmada: (c: string, w: string) =>
      `${c}: su cita queda confirmada para ${w}. Si no puede venir, llámenos.`,
    alterada: (c: string, w: string) =>
      `${c}: su cita ha pasado al ${w}. Si esa hora no le viene bien, llámenos.`,
    rejeitada: (c: string, w: string, why: string | null) =>
      `${c}: no hemos podido confirmar su cita del ${w}${why ? `. ${why}` : ''}. Llámenos para buscar otra hora.`,
  },
} as const

/**
 * The hour as the patient reads it: in the clinic's own timezone, written out.
 *
 * The timezone is the point, the same as it is in the prompt. `scheduled_at` is
 * UTC, and a patient in Lisbon told "16:00" about a booking at 17:00 local has
 * been told the wrong time by a message meant to prevent exactly that.
 */
function whenIn(iso: string, timezone: string, locale: 'pt' | 'es'): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'pt-PT', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function messageFor(
  kind: NotifyKind,
  clinic: NotifiableClinic,
  scheduledAt: string,
  rejectReason: string | null,
  /**
   * Put the clinic's number in the text.
   *
   * Only when the sender is a name. Every one of these ends by telling the
   * patient to ring the clinic, and when the message comes from the clinic's
   * own number that is one tap away; from an alphanumeric sender it is
   * one-way, nothing can be replied to, and "ligue-nos" with no number to ring
   * is an instruction that cannot be followed.
   */
  withPhone = false
): string {
  const locale = clinic.language === 'es' ? 'es' : 'pt'
  const when = whenIn(scheduledAt, clinic.timezone, locale)
  const t = COPY[locale]
  const said =
    kind === 'rejeitada'
      ? t.rejeitada(clinic.name, when, rejectReason)
      : t[kind](clinic.name, when)
  const phone = clinic.assigned_phone?.trim()
  return withPhone && phone ? `${said} ${phone}` : said
}
