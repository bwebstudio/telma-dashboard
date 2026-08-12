/**
 * The bookable times a window produces, in TypeScript.
 *
 * `available_slots` does this in SQL for the agent, which is the copy that
 * matters: it knows what is already taken and it is the one a caller is offered
 * from. This one is for the panel, which draws a week ahead and needs the shape
 * of the day rather than its availability.
 *
 * Two implementations of one rule is a real cost and the alternative was worse:
 * a round trip per day per view, on a screen that renders forty-two of them.
 * They are kept honest by both being tiny and by the SQL being the only one that
 * ever decides anything. If they disagree the panel is briefly wrong about how
 * full a Thursday looks; nobody is offered an hour that does not exist.
 */

export interface OpenWindow {
  /** "09:00:00" or "09:00". */
  start_time: string
  end_time: string
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Every start these windows allow, as "HH:MM", sorted and de-duplicated.
 *
 * The last start leaves room for the whole appointment before the window
 * closes, which is the rule that lets a clinic offer a forty-five minute
 * treatment without it running past the door being locked.
 */
export function startsIn(
  windows: OpenWindow[],
  stepMinutes: number,
  durationMinutes: number
): string[] {
  const step = Math.max(5, stepMinutes || 30)
  const duration = Math.max(5, durationMinutes || step)
  const out = new Set<string>()

  for (const w of windows) {
    const from = toMinutes(w.start_time)
    const to = toMinutes(w.end_time)
    for (let at = from; at + duration <= to; at += step) out.add(toTime(at))
  }
  return [...out].sort()
}
