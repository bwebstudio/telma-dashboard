/**
 * An hour as a person says it, not as a screen shows it.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * Every hour Telma reads out loud came from `Intl.DateTimeFormat` with
 * `hour: '2-digit'`, so what reached the voice was "quinta-feira, 6 de novembro
 * às 10:30". That is screen notation. The language audit put it first among the
 * things to change, and it is the one that repeats most: a caller hears two
 * times offered, hears one read back when it is held, and hears it again when
 * the booking is closed.
 *
 * Three problems with the old shape. The synthesiser decides on its own how to
 * read "10:30" and does not always decide the same way. A 24 hour clock said
 * out loud ("às dezoito e trinta") is how a timetable talks, not a
 * receptionist. And the day arrived as a digit, "6", which is read as a figure
 * among words.
 *
 * So the whole thing is written out here: weekday, day in words, month, and the
 * hour in the half and quarter hours people actually say, with the part of the
 * day attached because a twelve hour clock without it is ambiguous.
 *
 * ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────────
 * `slot_start`, which is an opaque UTC token handed back when holding and
 * recording an hour and is never read aloud. Changing how an hour is spoken
 * must not change what identifies it. See the long comment in
 * /api/availability.
 */

export type SpokenLang = 'pt' | 'es'

const UNITS: Record<SpokenLang, string[]> = {
  pt: ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze'],
  es: ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'],
}

/** The minutes that are not a half or a quarter, written out. Up to 59, which
 *  is all a clock needs, and only the ones a diary can actually produce would
 *  be enough -- but a clinic may set any slot length it likes. */
const TENS: Record<SpokenLang, Record<number, string>> = {
  pt: { 10: 'dez', 20: 'vinte', 30: 'trinta', 40: 'quarenta', 50: 'cinquenta' },
  es: { 10: 'diez', 20: 'veinte', 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta' },
}

const SMALL: Record<SpokenLang, string[]> = {
  pt: ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'],
  es: ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'],
}

/** A whole number under sixty, in words. Enough for minutes and for the day of
 *  a month, which is the only other figure in one of these sentences. */
export function numberInWords(value: number, lang: SpokenLang): string {
  if (value < 20) return SMALL[lang][value] || String(value)
  const ten = Math.floor(value / 10) * 10
  const unit = value % 10
  const tens = TENS[lang][ten]
  if (!tens) return String(value)
  if (!unit) return tens
  // "vinte e um" / "veintiuno": Spanish writes the twenties as one word and
  // the rest with "y", and both are read the same way by the synthesiser, so
  // the spelling matters only to a human reading this file.
  if (lang === 'es' && ten === 20) return `veinti${SMALL.es[unit]}`
  return lang === 'es' ? `${tens} y ${SMALL.es[unit]}` : `${tens} e ${SMALL.pt[unit]}`
}

const PART_OF_DAY: Record<SpokenLang, (hour24: number) => string> = {
  // Portugal says "da manhã" up to lunch, "da tarde" until dark and "da noite"
  // after it. The boundaries are the ordinary ones, not the astronomical.
  pt: (h) => (h < 6 ? 'da madrugada' : h < 13 ? 'da manhã' : h < 20 ? 'da tarde' : 'da noite'),
  es: (h) => (h < 6 ? 'de la madrugada' : h < 13 ? 'de la mañana' : h < 21 ? 'de la tarde' : 'de la noche'),
}

/**
 * The hour alone: "dez e meia da manhã", "a una y cuarto de la tarde".
 *
 * Twelve hour, with the part of the day, because that is how both languages
 * say an appointment out loud. Noon and midnight have their own words and skip
 * the part of the day, which would be nonsense next to them.
 */
export function spokenClock(hour24: number, minute: number, lang: SpokenLang): string {
  const noon = hour24 === 12 && minute === 0
  const midnight = hour24 === 0 && minute === 0
  if (noon) return lang === 'es' ? 'al mediodía' : 'ao meio-dia'
  if (midnight) return lang === 'es' ? 'a medianoche' : 'à meia-noite'

  // Portuguese does not say "doze e meia da tarde" at half past twelve: it says
  // "meio-dia e meia", and the part of the day disappears with it. Spanish is
  // happy with "las doce y media de la mañana", so this is pt only.
  const minutesPt = (m: number) =>
    m === 15 ? ' e um quarto' : m === 30 ? ' e meia' : ` e ${numberInWords(m, 'pt')}`
  if (lang === 'pt' && hour24 === 12) return `ao meio-dia${minutesPt(minute)}`
  if (lang === 'pt' && hour24 === 0) return `à meia-noite${minutesPt(minute)}`

  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const hour = UNITS[lang][h12]
  const part = PART_OF_DAY[lang](hour24)

  // "à uma" in Portuguese and "a la una" in Spanish: one o'clock is the only
  // hour either language treats as singular.
  const at = lang === 'es' ? (h12 === 1 ? 'a la' : 'a las') : h12 === 1 ? 'à' : 'às'

  let minutes: string
  if (minute === 0) minutes = ''
  else if (minute === 15) minutes = lang === 'es' ? ' y cuarto' : ' e um quarto'
  else if (minute === 30) minutes = lang === 'es' ? ' y media' : ' e meia'
  // Not "a quarter to", deliberately. "um quarto para as onze" needs the next
  // hour and is the shape most often misheard on a telephone; forty five said
  // plainly cannot be mistaken for anything else.
  else minutes = lang === 'es' ? ` y ${numberInWords(minute, 'es')}` : ` e ${numberInWords(minute, 'pt')}`

  return `${at} ${hour}${minutes} ${part}`
}

const WEEKDAYS: Record<SpokenLang, string[]> = {
  pt: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
}

const MONTHS: Record<SpokenLang, string[]> = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}

/** The clinic's own wall clock, as numbers we can do arithmetic on. `Intl` is
 *  the only way to get them for an arbitrary zone without a date library. */
function partsInZone(at: Date, zone: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const got: Record<string, string> = {}
  for (const p of f.formatToParts(at)) got[p.type] = p.value
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    weekday: WD[got.weekday] ?? 0,
    day: Number(got.day),
    month: Number(got.month),
    // "24" is what some runtimes return for midnight.
    hour: Number(got.hour) % 24,
    minute: Number(got.minute),
  }
}

/**
 * The whole thing, as she says it:
 *
 *   pt  "quinta-feira, seis de novembro, às dez e meia da manhã"
 *   es  "jueves, seis de noviembre, a las diez y media de la mañana"
 */
export function spokenDateTime(at: Date, zone: string, lang: SpokenLang): string {
  const p = partsInZone(at, zone)
  const day = numberInWords(p.day, lang)
  const month = MONTHS[lang][p.month - 1] ?? String(p.month)
  const de = lang === 'es' ? 'de' : 'de'
  return `${WEEKDAYS[lang][p.weekday]}, ${day} ${de} ${month}, ${spokenClock(p.hour, p.minute, lang)}`
}

/**
 * The same instant, for a conversation that is read instead of heard.
 *
 *   pt  "segunda-feira, 2 de novembro às 09:00"
 *   es  "lunes, 2 de noviembre a las 09:00"
 *
 * ── WHY IT IS NOT spokenDateTime ───────────────────────────────────────────
 * Everything the comment at the top of this file says about numbers read out
 * loud stops being true on a screen. "às nove da manhã" is longer to read than
 * "às 09:00" and less exact -- half past three in the afternoon is a sentence,
 * 15:30 is a time -- and the day as a word ("dois de novembro") reads like a
 * cheque, not like a date.
 *
 * It is here rather than left to the model because the model takes whatever
 * `say` holds and writes it down. Measured: with the written rule on the sheet
 * and a spoken `say` in the response, three runs in three wrote "às nove da
 * manhã" into a chat window. The field the model copies has to be the field
 * that is right, so the endpoint formats it per channel and the sheet stops
 * having an opinion.
 */
export function writtenDateTime(at: Date, zone: string, lang: SpokenLang): string {
  const p = partsInZone(at, zone)
  const month = MONTHS[lang][p.month - 1] ?? String(p.month)
  const clock = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  const at_ = lang === 'es' ? 'a las' : 'às'
  return `${WEEKDAYS[lang][p.weekday]}, ${p.day} de ${month} ${at_} ${clock}`
}

/** Only the hour, for where the day is already established. */
export function spokenTimeOnly(at: Date, zone: string, lang: SpokenLang): string {
  const p = partsInZone(at, zone)
  return spokenClock(p.hour, p.minute, lang)
}
