import type { Step3 } from './wizard-schema'

/**
 * Turning "we open at nine and close at seven" into the rows the diary reads.
 *
 * A row is a WINDOW the clinic is open for. The bookable times are generated
 * from it at the moment somebody asks, stepping by the clinic's `slot_minutes`
 * and only offering a start where the whole treatment fits before closing.
 *
 * This used to explode the timetable into one row per bookable start, up to two
 * thousand of them. Every one of those rows was exactly one appointment long,
 * which quietly made a longer treatment impossible: a forty-five minute session
 * has nowhere to go inside a thirty minute row, so it would have offered
 * nothing, on every day, with the hours in the panel ticked and correct.
 *
 * A lunch break is a gap between two windows rather than a rule applied to a
 * list, which is both what it means and the only way it survives being edited
 * later in the panel.
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
  const { pause } = schedule
  const rows: SlotRow[] = []

  const pauseStart = pause.enabled ? toMinutes(pause.start) : null
  const pauseEnd = pause.enabled ? toMinutes(pause.end) : null

  for (const group of ['weekdays', 'saturday', 'sunday'] as const) {
    const day = schedule[group]
    if (day.closed) continue

    const open = toMinutes(day.open)
    const close = toMinutes(day.close)

    // One window, or two with the break between them. A break that falls
    // outside opening hours is not a break, and a break that swallows the day
    // leaves nothing: both come out as no window rather than as a negative one.
    const spans: Array<[number, number]> =
      pauseStart !== null && pauseEnd !== null && pauseStart > open && pauseEnd < close
        ? [
            [open, pauseStart],
            [pauseEnd, close],
          ]
        : [[open, close]]

    for (const [from, to] of spans) {
      if (to <= from) continue
      for (const weekday of GROUP_WEEKDAYS[group]) {
        rows.push({
          weekday,
          start_time: toTime(from),
          end_time: toTime(to),
          // One seat. A clinic with two chairs adds a second diary in the
          // horários screen, where it can see what it is doing.
          capacity: 1,
          active: true,
        })
      }
    }
  }

  return rows
}
