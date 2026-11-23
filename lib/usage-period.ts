import type { Clinic } from '@/lib/types'

/**
 * The month a clinic is actually paying for, and what it has used inside it.
 *
 * ── TWO THINGS WERE WRONG, AND THEY COMPOUNDED ──────────────────────────────
 * The counter on the clinic's panel read `usage`, a table keyed on the
 * calendar month. The first clinic pays from the 27th to the 27th, so on the
 * first of every month its counter went back to zero in the middle of the
 * month it had already half spent, and on the 26th it showed a month that had
 * been over for weeks.
 *
 * The number inside that row was wrong too, and always short. `record_call`
 * writes the usage at the moment Telma files the call, with the duration she
 * believed then, which is always less than the call turned out to be: she
 * files before the goodbye. The platform's real duration arrives later, with
 * the end-of-call webhook, and that one corrects `calls.duration_seconds` and
 * nothing else. Measured on the first clinic in November: 14.8 minutes in the
 * counter against 16.0 in the calls themselves, about eight per cent short,
 * and the percentage on the screen short with it.
 *
 * So the counter is computed rather than stored: the window comes from the
 * subscription and the minutes come from `calls`, which is the column the
 * platform corrects. `usage` keeps being written and keeps being the thing
 * that bills; this is what a clinic is shown, and it is now the truth.
 *
 * ── WHY NOT A MIGRATION ─────────────────────────────────────────────────────
 * Because none is needed. `plan_renews_at` already holds the end of the paid
 * period and `billing_cycle` holds its length, so the window is arithmetic on
 * two columns that exist. A clinic that has never paid has neither, and falls
 * back to the calendar month, which for somebody with no subscription is the
 * only month there is.
 */

export interface BillingPeriod {
  start: Date
  /** Exclusive: the instant the next period begins. */
  end: Date
  /** False when there is no subscription to read and this is a calendar month. */
  fromSubscription: boolean
}

/**
 * One cycle later, clamped to the end of the month.
 *
 * Adding a month to the 31st in JavaScript lands in the month after next, and
 * a clinic that signed up on the 31st would see its window jump a month every
 * February. Stripe clamps to the last day; so does this.
 */
function addCycle(d: Date, n: number, yearly: boolean): Date {
  const out = new Date(d)
  if (yearly) {
    out.setUTCFullYear(out.getUTCFullYear() + n)
    return out
  }
  const day = out.getUTCDate()
  out.setUTCDate(1)
  out.setUTCMonth(out.getUTCMonth() + n)
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, lastDay))
  return out
}

export function billingPeriod(
  clinic: Pick<Clinic, 'plan_renews_at' | 'billing_cycle'> | null | undefined,
  now: Date = new Date()
): BillingPeriod {
  const anchor = clinic?.plan_renews_at ? new Date(clinic.plan_renews_at) : null

  if (!anchor || Number.isNaN(anchor.getTime())) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return { start, end, fromSubscription: false }
  }

  const yearly = clinic?.billing_cycle === 'annual'
  let end = anchor
  // ── A RENEWAL DATE THAT STOPPED MOVING ────────────────────────────────────
  // It is written by the Stripe webhook, and for a month that webhook was
  // dropping every invoice, so the date sat three days in the past while the
  // clinic went on being charged. Walking it forward means a counter that
  // keeps working through a missed event instead of freezing on the window
  // that happened to be current when the last one landed.
  let guard = 0
  while (end <= now && guard++ < 400) end = addCycle(end, 1, yearly)
  let start = addCycle(end, -1, yearly)
  // And the other direction, for a date set far ahead by hand.
  while (start > now && guard++ < 800) {
    end = start
    start = addCycle(start, -1, yearly)
  }
  return { start, end, fromSubscription: true }
}

interface CallRow {
  clinic_id?: string
  duration_seconds?: number | null
}

/** Minutes, from the seconds the platform reported. Two decimals, like the table. */
function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 100) / 100
}

/**
 * What one clinic has used inside one period.
 *
 * Reads a single column so that a busy month is still one small answer: the
 * sum would be better done in Postgres, and PostgREST on this project refuses
 * aggregate functions, so it is done here on the rows.
 */
export async function minutesUsedIn(
  db: any,
  clinicId: string,
  period: BillingPeriod
): Promise<{ minutes: number; calls: number }> {
  const { data } = await db
    .from('calls')
    .select('duration_seconds')
    .eq('clinic_id', clinicId)
    .gte('created_at', period.start.toISOString())
    .lt('created_at', period.end.toISOString())

  const rows = (data ?? []) as CallRow[]
  const seconds = rows.reduce((total, row) => total + (Number(row.duration_seconds) || 0), 0)
  return { minutes: toMinutes(seconds), calls: rows.length }
}

/**
 * The same, for a list of clinics, in one query.
 *
 * Each clinic has its own window, so the query asks for everything since the
 * earliest of them and the bucketing happens here. The alternative is one
 * query per clinic on a screen that lists them all.
 */
export async function minutesUsedByClinic(
  db: any,
  clinics: Array<Pick<Clinic, 'id' | 'plan_renews_at' | 'billing_cycle'>>,
  now: Date = new Date()
): Promise<Map<string, { minutes: number; calls: number; period: BillingPeriod }>> {
  const periods = new Map(clinics.map((c) => [c.id, billingPeriod(c, now)]))
  const out = new Map<string, { minutes: number; calls: number; period: BillingPeriod }>()
  for (const c of clinics) {
    out.set(c.id, { minutes: 0, calls: 0, period: periods.get(c.id)! })
  }
  if (!clinics.length) return out

  const earliest = [...periods.values()].reduce(
    (min, p) => (p.start < min ? p.start : min),
    periods.values().next().value!.start
  )
  const { data } = await db
    .from('calls')
    .select('clinic_id, duration_seconds, created_at')
    .gte('created_at', earliest.toISOString())

  for (const row of (data ?? []) as Array<CallRow & { created_at: string }>) {
    const id = row.clinic_id
    if (!id) continue
    const bucket = out.get(id)
    if (!bucket) continue
    const at = new Date(row.created_at)
    if (at < bucket.period.start || at >= bucket.period.end) continue
    bucket.calls += 1
    bucket.minutes += Number(row.duration_seconds) || 0
  }
  for (const bucket of out.values()) bucket.minutes = toMinutes(bucket.minutes)
  return out
}
