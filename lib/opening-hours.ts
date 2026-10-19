import { createAdminClient } from '@/lib/supabase/admin'

/**
 * When the clinic's door is open, read off the diary.
 *
 * ── WHY A DAY IS A LIST AND NOT A PAIR ─────────────────────────────────────
 * This used to return the earliest opening and the latest closing of each
 * weekday, which is the same thing only for a clinic that never closes for
 * lunch. The sign-up writes two spans whenever a break is set -- 09:00-13:00
 * and 14:00-19:00 -- and both of them collapsed into "09:00-19:00".
 *
 * Two things went wrong with that, and neither of them announced itself:
 *
 *   Telma was told the clinic is open from nine to seven, so a caller asking
 *   what time they open was told the wrong thing, in the clinic's own name.
 *
 *   "Is it open now" answered yes at half past one, so a call during the
 *   break was handled as a call during opening hours: no "we are closed", no
 *   emergency routing, and an offer to look at the diary for today.
 *
 * Kept in one module because both the voice endpoint and the agent's context
 * endpoint need it, and they had a copy each.
 */
export interface DaySpan {
  opens: string
  closes: string
}

export interface DayHours {
  weekday: number
  /** In order, and more than one when the clinic closes in the middle. */
  spans: DaySpan[]
}

export async function openingHours(clinicId: string): Promise<DayHours[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('availability_slots')
    .select('weekday, start_time, end_time')
    .eq('clinic_id', clinicId)
    .eq('active', true)

  return groupHours((data ?? []) as Array<{ weekday: number; start_time: string; end_time: string }>)
}

/**
 * The rows, grouped into days.
 *
 * Touching spans are joined: a diary cut into hourly rows, which is what some
 * clinics end up with after editing the week by hand, describes the same open
 * door as one long row and must not be read aloud as eight separate windows.
 */
export function groupHours(
  rows: Array<{ weekday: number; start_time: string; end_time: string }>
): DayHours[] {
  const byDay = new Map<number, DaySpan[]>()

  for (const row of [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const opens = row.start_time.slice(0, 5)
    const closes = row.end_time.slice(0, 5)
    if (closes <= opens) continue

    const spans = byDay.get(row.weekday) ?? []
    const last = spans[spans.length - 1]
    if (last && opens <= last.closes) {
      if (closes > last.closes) last.closes = closes
    } else {
      spans.push({ opens, closes })
    }
    byDay.set(row.weekday, spans)
  }

  return [...byDay.entries()]
    .map(([weekday, spans]) => ({ weekday, spans }))
    .sort((a, b) => a.weekday - b.weekday)
}

/** "09:00-13:00, 14:00-19:00". What Telma reads out when asked. */
export function spansText(day: DayHours): string {
  return day.spans.map((s) => `${s.opens}-${s.closes}`).join(', ')
}

/**
 * Open at this very moment, in the clinic's own timezone.
 *
 * Every span, not the outer edges: a clinic on its lunch break is shut, and
 * saying otherwise turns the one call that needed the emergency number into
 * an ordinary one.
 */
export function isOpenNow(hours: DayHours[], timezone: string, now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  if (weekday < 0) return false
  const hhmm = `${get('hour')}:${get('minute')}`
  return hours.some(
    (day) =>
      day.weekday === weekday && day.spans.some((s) => hhmm >= s.opens && hhmm < s.closes)
  )
}
