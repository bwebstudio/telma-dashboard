/**
 * What the patient is told, and nothing about how it is sent.
 *
 * ── NO IMPORTS ─────────────────────────────────────────────────────────────
 * Deliberate, the same way lib/onboarding/prompt.ts is: this is the part worth
 * reading in a test, and a test that needs a database in order to check a
 * sentence is a test nobody runs. Everything touching Twilio or Supabase lives
 * in notify-patient.ts.
 *
 * ── THE REASON FOR A REFUSAL DOES NOT TRAVEL ──────────────────────────────
 * It used to. The panel asks for "Motivo (opcional)" under a line saying it is
 * kept on the record, and the text the receptionist typed went out in the SMS
 * to the patient. Anything written there in the belief that it was internal --
 * why this patient, what happened last time -- was read by the person it was
 * about. The reason stays in the panel now; the patient is told the booking
 * was not confirmed and to ring.
 *
 * These are read by somebody who asked for an appointment out loud days ago and
 * is now looking at their telephone. The clinic's name comes first, because
 * that is what makes it not spam; then what happened; then what to do about it.
 * No link, no reference number, no "reply STOP": the sender is the clinic's own
 * line, so replying and calling back both reach the clinic.
 */

/** `rejeitada` is the clinic saying no to a booking it never accepted.
 *  `cancelada` is a booking that existed and stopped existing. Different
 *  events, different sentences: see 0011. */
export type NotifyKind = 'confirmada' | 'alterada' | 'rejeitada' | 'cancelada'

/** Only what a message needs. Narrower than `Clinic` on purpose: this module
 *  imports nothing, and a message does not depend on a plan or a phone. */
export interface NotifiableClinic {
  name: string
  timezone: string
  language?: string | null
  /**
   * The clinic's own public line: the one on the door, the one the patient
   * already has. This is what goes in the message.
   */
  phone?: string | null
  /**
   * The Telma line. Only the number to ring when the clinic bought one of its
   * own and publishes it; on a shared line it is the hidden end of a forward,
   * which nobody should be told to call. See `ringable`.
   */
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
    confirmada: (c: string, w: string) => `${c}: marcação confirmada para ${w}.`,
    alterada: (c: string, w: string) => `${c}: a sua marcação passou para ${w}.`,
    rejeitada: (c: string, w: string) => `${c}: não foi possível confirmar a sua marcação de ${w}.`,
    cancelada: (c: string, w: string) => `${c}: a sua marcação de ${w} foi cancelada.`,
  },
  es: {
    confirmada: (c: string, w: string) => `${c}: su cita queda confirmada para ${w}.`,
    alterada: (c: string, w: string) => `${c}: su cita ha pasado al ${w}.`,
    rejeitada: (c: string, w: string) => `${c}: no hemos podido confirmar su cita del ${w}.`,
    cancelada: (c: string, w: string) => `${c}: su cita del ${w} ha quedado cancelada.`,
  },
} as const

/**
 * How to reach the clinic, which is a different sentence when there is a
 * number to print and when there is not.
 *
 * An alphanumeric sender is one-way: nothing can be replied to, so "ligue-nos"
 * with no number is an instruction nobody can follow. From the clinic's own
 * number it is one tap and printing the digits again is noise.
 */
const REACH = {
  pt: {
    confirmada: (n: string | null) =>
      n ? `Para alterações ou cancelamentos: ${n}.` : 'Para alterações ou cancelamentos, ligue-nos.',
    alterada: (n: string | null) =>
      n ? `Para alterações ou cancelamentos: ${n}.` : 'Para alterações ou cancelamentos, ligue-nos.',
    rejeitada: (n: string | null) =>
      n ? `Para fazer uma nova marcação, ligue para ${n}.` : 'Ligue-nos para fazer uma nova marcação.',
    cancelada: (n: string | null) =>
      n ? `Para fazer uma nova marcação, ligue para ${n}.` : 'Ligue-nos para fazer uma nova marcação.',
  },
  es: {
    confirmada: (n: string | null) => (n ? `Si no puede venir, llame al ${n}.` : 'Si no puede venir, llámenos.'),
    alterada: (n: string | null) =>
      n ? `Si esa hora no le viene bien, llame al ${n}.` : 'Si esa hora no le viene bien, llámenos.',
    rejeitada: (n: string | null) =>
      n ? `Llame al ${n} para buscar otra hora.` : 'Llámenos para buscar otra hora.',
    cancelada: (n: string | null) =>
      n ? `Para pedir otra cita, llame al ${n}.` : 'Llámenos para pedir otra cita.',
  },
} as const

/**
 * The number to print, or null.
 *
 * The clinic's own line, always, when it has one: that is what the patient
 * already knows and what somebody picks up. `assigned_phone` is only the
 * number to ring for a clinic that bought a Telma line of its own and
 * publishes it; for everybody else it is the shared line, the hidden end of a
 * forward that nobody dials, and telling a patient to call it would hand out
 * the one number this product keeps to itself.
 */
function ringable(clinic: NotifiableClinic): string | null {
  const own = clinic.phone?.trim()
  if (own) return own
  const telma = clinic.assigned_phone?.trim()
  return telma || null
}

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
  const said = COPY[locale][kind](clinic.name, when)
  return `${said} ${REACH[locale][kind](withPhone ? ringable(clinic) : null)}`
}
