/**
 * What a reminder says, and nothing about how it is sent.
 *
 * ── NO IMPORTS ─────────────────────────────────────────────────────────────
 * The same rule as lib/notify-copy.ts and for the same reason: this is the part
 * worth reading in a test, and a test that needs a database in order to check a
 * sentence is a test nobody runs. Everything touching Twilio lives in lib/sms.ts.
 *
 * ── IT NEVER SAYS WHAT THE TREATMENT WAS ───────────────────────────────────
 * The row knows. The clinic's screen says it. The message does not, and this is
 * the single most important thing in this file.
 *
 * An SMS arrives on a lock screen. It is read on a kitchen table, by whoever
 * picked the telephone up, and months after the appointment it is about. "Está
 * na hora da sua revisão de implantes" tells a son what was done to his mother,
 * a flatmate what somebody is being treated for, and an ex-partner who still
 * knows the passcode everything. The patient loses nothing by not being told:
 * they know what they came for, and the clinic will say it when they ring.
 *
 * ── HOW TO STOP IT ─────────────────────────────────────────────────────────
 * In every message, and it cannot be "responda BAIXA". In Portugal these go out
 * with the clinic's name as the sender, because Portuguese voice numbers mostly
 * cannot carry an SMS, and an alphanumeric sender is one-way: a reply reaches
 * nobody. So the way to stop it is the way to reach the clinic, which is the
 * number that is already in the message, and somebody at the clinic ticks the
 * box on the record.
 *
 * ── SHORT, AND WHY IT IS NOT MEANNESS ──────────────────────────────────────
 * "á" is not in the GSM-7 alphabet, so any Portuguese or Spanish sentence with
 * one in it is sent as UCS-2: seventy characters to a segment instead of a
 * hundred and sixty, and a clinic pays per segment. Stripping the accents to
 * save money would make a clinic's own message to its own patients look like a
 * scam, so the accents stay and the sentences are short instead.
 */

export type RecallKind = 'aviso' | 'campanha'

/** Only what a message needs, the same narrowing notify-copy uses. */
export interface RecallClinic {
  name: string
  language?: string | null
  /** The line the patient should ring. Always written into the text: the whole
   *  purpose of a reminder is to get somebody to ring, and half of these are
   *  sent from a name rather than a number, where there is nothing to call
   *  back. */
  assigned_phone?: string | null
}

const COPY = {
  pt: {
    aviso: (c: string) => `${c}: é hora de marcar a sua consulta.`,
    call: 'Ligue-nos:',
    callNoNumber: 'Ligue-nos para marcar.',
    stop: 'Se não quiser avisos, diga-nos.',
  },
  es: {
    aviso: (c: string) => `${c}: le toca pedir su próxima cita.`,
    call: 'Llámenos:',
    callNoNumber: 'Llámenos para pedir hora.',
    stop: 'Si no quiere avisos, dígalo.',
  },
} as const

/** The cap on what a clinic can write into a commercial message. Two UCS-2
 *  segments once the clinic's name, the number and the opt-out are added. */
export const BODY_LIMIT = 200

export function recallMessage(
  clinic: RecallClinic,
  kind: RecallKind,
  /** The clinic's own sentence. Required for a campanha, ignored for an aviso:
   *  the care reminder is fixed copy, versioned with the application and
   *  tested, because a clinic writing its own each time is a clinic writing the
   *  wrong one once. */
  body?: string | null
): string {
  const locale = clinic.language === 'es' ? 'es' : 'pt'
  const t = COPY[locale]
  const phone = clinic.assigned_phone?.trim()

  const written = kind === 'campanha' ? signed(clinic.name, body) : null
  const said = written ?? t.aviso(clinic.name)

  return [said, phone ? `${t.call} ${phone}.` : t.callNoNumber, t.stop]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The clinic's own sentence with the clinic's name in front of it.
 *
 * The name goes first whatever the clinic wrote. It is what makes the message
 * not spam, and a clinic that forgets to sign its own message has sent an
 * anonymous advert to its own patients. Unless it signed it already, in which
 * case saying it twice is the other way of looking careless.
 */
function signed(name: string, body: string | null | undefined): string | null {
  const written = (body ?? '').trim().slice(0, BODY_LIMIT)
  if (!written) return null
  const flat = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return flat(written).startsWith(flat(name).slice(0, 12)) ? written : `${name}: ${written}`
}

/**
 * How many SMS segments this will be charged as.
 *
 * Shown to the clinic beside the box it writes a campaign in, because otherwise
 * the only place the number of segments appears is the invoice. The rule is
 * Twilio's and it is the one above: a single character outside GSM-7 turns the
 * whole message into UCS-2 and cuts the segment from 160 characters to 70.
 */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM7_EXTENDED = '^{}\\[~]|€'

export function segmentsFor(text: string): number {
  const ucs2 = [...text].some((ch) => !GSM7.includes(ch) && !GSM7_EXTENDED.includes(ch))
  // Split messages carry a header, so the segment shrinks once there is more
  // than one of them: 70 to 67, and 160 to 153.
  if (ucs2) return text.length <= 70 ? 1 : Math.ceil(text.length / 67)
  // An extended character costs two units even in GSM-7.
  const units = [...text].reduce((n, ch) => n + (GSM7_EXTENDED.includes(ch) ? 2 : 1), 0)
  return units <= 160 ? 1 : Math.ceil(units / 153)
}
