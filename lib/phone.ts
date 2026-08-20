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
