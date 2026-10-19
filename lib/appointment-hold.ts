import type { Appointment } from '@/lib/types'

// How long a pre-marcação holds its hour, and how that clock is read.
//
// Isomorphic on purpose. The countdown ticks in the browser and the endpoint
// answers from the server, and both have to say the same number: a clinic
// looking at 04:12 on screen and an agent told 09:12 by the API would be two
// different products. These are also deliberately not in lib/clinic-utils,
// which reaches the database with the service role key and must never be
// imported into anything the browser downloads.

/** The window a clinic has to answer a pre-marcação. */
export const HOLD_MINUTES = 30

/** What a clinic may choose. A list and not a free number: fifteen minutes
 *  and four hours are both real answers to "how long before we give the
 *  hour back", and 7 or 100000 are neither. */
export const HOLD_CHOICES = [15, 30, 60, 120, 240] as const
export const HOLD_SECONDS = HOLD_MINUTES * 60

/**
 * When the countdown starts asking to be noticed.
 *
 * Five minutes, because that is roughly the last moment a receptionist can put
 * the phone down, read the booking and press Confirmar. Earlier and the panel
 * would be in alarm for most of every hold, which teaches people to ignore it.
 */
export const CRITICAL_SECONDS = 5 * 60

/**
 * Seconds left before this pre-marcação lapses.
 *
 * Null when there is no deadline to count: anything that is not 'pendente', and
 * the bookings written before migration 0020, which have no expires_at and are
 * not going to grow one. Never negative — zero means the window is closed, and
 * a caller should not have to decide what minus forty seconds means.
 */
export function getPreAppointmentTimeRemaining(
  appointment: Pick<Appointment, 'status' | 'expires_at'>,
  now: number = Date.now()
): number | null {
  if (appointment.status !== 'pendente') return null
  if (!appointment.expires_at) return null

  const expiresAt = new Date(appointment.expires_at).getTime()
  if (Number.isNaN(expiresAt)) return null

  return Math.max(0, Math.round((expiresAt - now) / 1000))
}

/** "MM:SS". Minutes are not padded past two digits; nothing here runs an hour. */
export function formatTimeRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Running out. False when there is no deadline: no clock, no alarm. */
export function isPreAppointmentCritical(
  appointment: Pick<Appointment, 'status' | 'expires_at'>,
  now: number = Date.now()
): boolean {
  const remaining = getPreAppointmentTimeRemaining(appointment, now)
  return remaining !== null && remaining > 0 && remaining <= CRITICAL_SECONDS
}

/**
 * How long this particular booking's hold was, in seconds.
 *
 * Read off the row rather than off the clinic's current setting, because the
 * two are not the same number. A clinic that moves from four hours to fifteen
 * minutes has bookings already counting down from four hours, and a bar drawn
 * against the new setting would show them full to the brim and then jump.
 *
 * Falls back to the default where the arithmetic cannot be done: the bookings
 * written before expires_at existed, and anything with an unreadable date.
 */
export function holdLengthSeconds(
  appointment: Pick<Appointment, 'expires_at' | 'created_at'>
): number {
  if (!appointment.expires_at) return HOLD_SECONDS
  const expires = new Date(appointment.expires_at).getTime()
  const created = new Date(appointment.created_at).getTime()
  if (Number.isNaN(expires) || Number.isNaN(created)) return HOLD_SECONDS
  const seconds = Math.round((expires - created) / 1000)
  return seconds > 0 ? seconds : HOLD_SECONDS
}

/**
 * How much of the window is left, 0 to 100, for the bar.
 *
 * Counts down rather than up: the bar empties as the time does, which is the
 * direction people read a deadline in. Capped at 100 because a booking written
 * with a longer deadline by hand should not draw a bar past its own track.
 *
 * The total is the booking's own hold, which since migration 0065 is whatever
 * its clinic had configured when it was written. Defaulting it keeps the old
 * single-length callers honest rather than silently halving their bar.
 */
export function holdPercentage(
  secondsRemaining: number,
  totalSeconds: number = HOLD_SECONDS
): number {
  const total = totalSeconds > 0 ? totalSeconds : HOLD_SECONDS
  return Math.max(0, Math.min(100, Math.round((secondsRemaining / total) * 100)))
}
