/**
 * What is true about one day, said once, for all three zooms to read.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────────
 * Day, week and month are the same diary at three distances. A zoom may drop
 * detail because there is no room for it — a month cell cannot carry seven
 * names — but it may never drop a fact that changes what somebody does.
 *
 * Two facts change what somebody does: a booking is waiting for the clinic's
 * answer, and a booking was called off so an hour is free again. Everything
 * else is an aid to reading: the colour of a service, who exactly is coming,
 * the bar showing how full the day is.
 *
 * They had drifted into three different screens. The week filtered cancelled
 * bookings out entirely, so the freed hour — the thing a clinic can act on —
 * was the one thing the planning view could not show. The month said only how
 * many bookings a day had, so a day with four confirmed and a day with four
 * waiting for an answer were the same number in the same grey. The day view
 * had both and neither of the others' aids.
 *
 * So the facts are counted here, once, and each view decides only how much
 * room it has to say them in.
 */

// Relative, with its extension, the same as lib/service-duration.ts: it is what
// lets scripts/test-agenda-facts.mjs import this with nothing but node.
import { holdsAnHour, type Appointment, type AppointmentStatus } from './types.ts'

/**
 * The three words a diary speaks.
 *
 * The database keeps more: 'copiada' means the booking reached the clinic's own
 * software, 'rejeitada' means the clinic turned it down rather than the patient
 * calling off. Both are worth recording and neither changes what a day looks
 * like: the appointment is happening, waiting for an answer, or not happening.
 *
 * Lifted out of AgendaDay, where it was, so the week and the month say the same
 * three words rather than inventing their own.
 */
export const SHOWN_AS: Record<AppointmentStatus, 'confirmada' | 'pendente' | 'cancelada'> = {
  confirmada: 'confirmada',
  copiada: 'confirmada',
  pendente: 'pendente',
  cancelada: 'cancelada',
  rejeitada: 'cancelada',
  expirada: 'cancelada',
}

export interface DayFacts {
  /** Bookable starts the clinic offers on this day. Zero means closed. */
  total: number
  /** Bookings still holding an hour. A cancelled one is not one of these,
   *  which is the whole point of looking ahead. */
  busy: number
  free: number
  /** Waiting for the clinic to answer. The first fact that changes what
   *  somebody does, and it is a subset of `busy`: a pre-marcação holds its
   *  hour while it waits. */
  pending: number
  /** Called off and not yet acknowledged. The second one: an hour came back. */
  cancelled: number
  closed: boolean
  blocked: boolean
}

export function dayFacts(
  appointments: Appointment[],
  /** How many bookable starts the clinic offers that day. */
  openStarts: number,
  blocked = false
): DayFacts {
  const busy = appointments.filter((a) => holdsAnHour(a.status)).length
  return {
    total: openStarts,
    busy,
    free: Math.max(0, openStarts - busy),
    pending: appointments.filter((a) => a.status === 'pendente').length,
    // Only the ones nobody has said they have seen. A cancellation the clinic
    // has acknowledged is history, and a mark that never goes away is a mark
    // nobody reads.
    cancelled: appointments.filter(
      (a) => SHOWN_AS[a.status] === 'cancelada' && !a.cancel_seen_at
    ).length,
    closed: openStarts === 0 && !blocked,
    blocked,
  }
}

/**
 * Whether this day is asking for something.
 *
 * The one line every zoom has to be able to draw, however little room it has.
 * A month cell has space for a dot; that dot is this.
 */
export function needsAnswer(facts: DayFacts): boolean {
  return facts.pending > 0 || facts.cancelled > 0
}
