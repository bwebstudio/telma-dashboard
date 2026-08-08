import type { Step3 } from './wizard-schema'

/**
 * Turning "we open at nine and close at seven" into bookable slots.
 *
 * `availability_slots` holds one row per bookable start time per weekday, which
 * is what the voice agent reads when it offers an hour. The wizard asks the
 * question the way a clinic thinks about it (a timetable) and this converts it
 * into the shape the agent needs.
 *
 * The two durations are genuinely different questions and both are used here.
 * `appointment_duration_minutes` sets each row's end time, so the diary shows
 * how long the patient is actually there. `min_interval_minutes` sets the step
 * between starts, so a clinic running two chairs can start a new 45 minute
 * appointment every 30 minutes without the generator inventing that for them.
 */

export interface SlotRow {
  weekday: number
  start_time: string
  end_time: string
  capacity: number
  active: boolean
}

// Postgres `extract(dow)`: 0 is Sunday. The wizard's three groups map onto it
// here, once, rather than in the action that writes the rows.
const GROUP_WEEKDAYS: Record<'weekdays' | 'saturday' | 'sunday', number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  saturday: [6],
  sunday: [0],
}

/**
 * A hard ceiling on how many rows one sign-up may create.
 *
 * Seven days open fourteen hours at a five minute interval is 1176 rows, which
 * is legitimate. Nothing sensible goes past this, so a number that does is a
 * bad payload that got through validation, and it should hit a limit rather
 * than a statement timeout in front of a paying customer.
 */
const MAX_SLOTS = 2000

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

export function buildSlots(schedule: Step3): SlotRow[] {
  const { appointment_duration_minutes: duration, min_interval_minutes: interval, pause } = schedule
  const rows: SlotRow[] = []

  const pauseStart = pause.enabled ? toMinutes(pause.start) : null
  const pauseEnd = pause.enabled ? toMinutes(pause.end) : null

  for (const group of ['weekdays', 'saturday', 'sunday'] as const) {
    const day = schedule[group]
    if (day.closed) continue

    const open = toMinutes(day.open)
    const close = toMinutes(day.close)

    for (let start = open; start + duration <= close; start += interval) {
      const end = start + duration
      // Any overlap with lunch, not just a start inside it: an appointment that
      // begins at 12:45 and runs to 13:30 is in the middle of the break.
      if (pauseStart !== null && pauseEnd !== null && start < pauseEnd && end > pauseStart) continue

      for (const weekday of GROUP_WEEKDAYS[group]) {
        rows.push({
          weekday,
          start_time: toTime(start),
          end_time: toTime(end),
          // One seat. A clinic with two chairs raises this in the horários
          // screen, where it can see what it is doing; guessing it from the
          // interval being shorter than the duration would be clever and wrong.
          capacity: 1,
          active: true,
        })
      }
      if (rows.length > MAX_SLOTS) return rows.slice(0, MAX_SLOTS)
    }
  }

  return rows
}
