/**
 * Which number goes on an appointment.
 *
 * Whether a number is long enough to be a number at all is deliberately not a
 * full validator: this runs on what a voice model heard down a telephone, and
 * being strict about which ranges exist would reject real people. It catches
 * the failure that actually happened, which is digits quietly going missing.
 *
 * Spain and Portugal both use nine national digits. Anything else is checked
 * only against E.164's own bounds, because Telma answers callers from anywhere.
 */
export function plausiblePhone(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  if (digits.startsWith('34') || digits.startsWith('351')) {
    const national = digits.slice(digits.startsWith('34') ? 2 : 3)
    return national.length === 9
  }
  return true
}

/**
 * The number she took, or failing that the number the call came from.
 *
 * A booking used to be discarded when the phone did not look whole, on the
 * reasoning that an appointment nobody can be rung about is barely an
 * appointment. That is true, and it threw away a real booking while the network
 * was holding the caller's own number the entire time. Losing the appointment
 * is the worse of the two mistakes: a slightly wrong number can be corrected by
 * ringing the one the call came from, and a booking nobody knows about cannot
 * be corrected at all.
 *
 * Null only when neither is usable, which on a real telephone means a withheld
 * number and a misheard one in the same call.
 */
export function phoneForAppointment(said: unknown, callerId: unknown): string | null {
  if (plausiblePhone(said)) return said as string
  if (plausiblePhone(callerId)) return callerId as string
  return null
}

/**
 * Somebody has to be expected.
 *
 * The prompt asks for the name and reads it back, and that was the whole of the
 * protection: `record_call` takes whatever arrives, null included, and an
 * appointment with no name reaches the clinic as an hour with nobody in it.
 * The receptionist cannot ring to confirm, cannot find the file, and cannot
 * tell it from a mistake. Refused here, while the agent is still on the line
 * and can ask again, the same way a phone that is not a phone is refused.
 *
 * Deliberately shallow: two characters that are not punctuation. This is not
 * trying to decide whether a name is a real name, only whether anything was
 * written down.
 */
/**
 * Somebody has to be expected.
 *
 * The prompt asks for the name and reads it back, and that was the whole of the
 * protection: `record_call` takes whatever arrives, null included, and an
 * appointment with no name reaches the clinic as an hour with nobody in it.
 * The receptionist cannot ring to confirm, cannot find the file, and cannot
 * tell it from a mistake. Refused at the webhook, while the agent is still on
 * the line and can ask again, the same way a phone that is not a phone is.
 *
 * Deliberately shallow: two letters. This is not trying to decide whether a
 * name is a real name, only whether anything was written down.
 */
export function plausibleName(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const name = value.trim()
  if (name.length < 2) return false
  if (!/\p{L}{2}/u.test(name)) return false
  return !PLACEHOLDER_NAMES.has(
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[.\s]+/g, ' ')
      .trim()
  )
}

/**
 * ── E O QUE ELA ESCREVE QUANDO NÃO TEM NOME ─────────────────────────────────
 *
 * Numa chamada a sério registou `caller_name: "não confirmado"`, e o painel da
 * clínica mostrou uma linha chamada "não confirmado". Não é um nome: é a
 * maneira de o modelo dizer que não ficou com nenhum, e o campo tem uma
 * maneira melhor de o dizer, que é vir vazio. Vazio o painel mostra o número;
 * com isto mostrava uma pessoa que não existe.
 *
 * Comparado sem acentos e sem pontos, porque "n/a" e "N.A." são o mesmo.
 */
const PLACEHOLDER_NAMES = new Set([
  'nao confirmado',
  'no confirmado',
  'nao informado',
  'no informado',
  'nao disse',
  'no lo dijo',
  'nao fornecido',
  'no facilitado',
  'desconhecido',
  'desconocido',
  'sem nome',
  'sin nombre',
  'a pessoa',
  'la persona',
  'o paciente',
  'el paciente',
  'anonimo',
  'n a',
  'na',
  'nd',
  'unknown',
  'not provided',
])
