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
 * How much of the window is left, 0 to 100, for the bar.
 *
 * Counts down rather than up: the bar empties as the time does, which is the
 * direction people read a deadline in. Capped at 100 because a booking written
 * with a longer deadline by hand should not draw a bar past its own track.
 */
export function holdPercentage(secondsRemaining: number): number {
  return Math.max(0, Math.min(100, Math.round((secondsRemaining / HOLD_SECONDS) * 100)))
}
