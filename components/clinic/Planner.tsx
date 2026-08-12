import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import type { Appointment, AvailabilitySlot, BlockedDay } from '@/lib/types'
import { dayIn, dayKeyIn, timeIn, weekdayIn } from '@/lib/time'
import { startsIn } from '@/lib/slots'
import { bookingCategory, categoryBackground } from '@/lib/service-colour'
import { resolveDuration, type DurationSource } from '@/lib/service-duration'
import { serviceLabel } from '@/lib/onboarding/catalog'

export type PlannerView = 'semana' | 'mes'

/**
 * Weeks and months ahead, so a clinic can plan instead of only react.
 *
 * The hour grid on this page says which hours the clinic offers *in a normal
 * week*. That is a rule, not a calendar, and you cannot book a holiday against
 * a rule. This is the calendar the rule produces once the real bookings and the
 * blocked days are laid over it.
 *
 * Two views and no more. The month answers "when am I free enough to close for
 * three days"; the week answers "what does Thursday actually look like". A day
 * view would be the agenda, which already exists.
 */
export function Planner({
  view,
  anchor,
  slots,
  blocked,
  appointments,
  dict,
  locale,
  tz,
  now,
  step,
  duration,
  clinic,
}: {
  view: PlannerView
  /** The week or month on screen: any day inside it. */
  anchor: Date
  slots: AvailabilitySlot[]
  blocked: BlockedDay[]
  appointments: Appointment[]
  dict: Dictionary
  locale: Locale
  tz: string
  now: Date
  /** How finely the day is cut, and how long an ordinary appointment runs. */
  step: number
  duration: number
  /** To colour a booking by what it is for. */
  clinic: DurationSource
}) {
  const t = dict.horarios

  // Which weekdays the clinic opens, and every time each one produces.
  //
  // Generated, not read. A row used to be one bookable hour and this took its
  // start time; a row is now a window the clinic is open for, so reading it
  // straight would show one time per day and call the rest closed.
  const windowsByWeekday = new Map<number, AvailabilitySlot[]>()
  for (const s of slots) {
    if (!s.active) continue
    const list = windowsByWeekday.get(s.weekday) ?? []
    list.push(s)
    windowsByWeekday.set(s.weekday, list)
  }
  const hoursByWeekday = new Map<number, string[]>()
  for (const [weekday, windows] of windowsByWeekday) {
    hoursByWeekday.set(weekday, startsIn(windows, step, duration))
  }

  const blockedByDay = new Map(blocked.map((b) => [b.day.slice(0, 10), b]))

  // A cancelled or refused booking does not occupy its hour any more, so it is
  // not counted and its slot shows as free — which is the whole point of
  // looking ahead.
  const live = appointments.filter((a) => a.status !== 'cancelada' && a.status !== 'rejeitada')
  const byDay = new Map<string, Appointment[]>()
  for (const a of live) {
    const key = dayKeyIn(tz, new Date(a.scheduled_at))
    const list = byDay.get(key) ?? []
    list.push(a)
    byDay.set(key, list)
  }

  const todayKey = dayKeyIn(tz, now)
  // Monday first: a clinic's week starts when its week starts, not on Sunday.
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]

  function dayState(date: Date) {
    const key = dayKeyIn(tz, date)
    const dow = weekdayIn(tz, date)
    return {
      key,
      dow,
      block: blockedByDay.get(key),
      open: hoursByWeekday.get(dow) ?? [],
      appts: (byDay.get(key) ?? []).sort(
        (a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
      ),
      isToday: key === todayKey,
    }
  }

  if (view === 'mes') {
    // Six rows always: a month that needs five looks broken next to one that
    // needs six if the grid changes height as you page through the year.
    const first = new Date(anchor)
    const firstDow = weekdayIn(tz, first)
    const lead = firstDow === 0 ? 6 : firstDow - 1
    const cells = Array.from({ length: 42 }, (_, i) => dayIn(tz, i - lead, first))
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit' })

    const legend = (
      // Only where the words had to be dropped. On a wider screen every cell
      // says it in full and a key underneath would be noise.
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft sm:hidden">
        {[
          ['bg-ok/50', t.free],
          ['bg-line-strong', t.closed],
          ['bg-warn', t.blocked],
        ].map(([bar, text]) => (
          <li key={text} className="flex items-center gap-1.5">
            <span className={`h-1 w-5 rounded-full ${bar}`} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    )

    return (
      <>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
          {weekdayOrder.map((wd) => (
            <div key={wd} className="label-caps px-2 py-2 text-center">
              <span className="hidden sm:inline">{dict.weekdays[wd].slice(0, 3)}</span>
              <span className="sm:hidden">{dict.weekdays[wd].slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const d = dayState(date)
            const outside = month.format(date) !== month.format(first)
            const count = d.appts.length
            return (
              <Link
                key={d.key}
                href={`/hoje?d=${d.key}`}
                className={`min-h-[4.5rem] border-b border-r border-line p-1.5 last:border-r-0 sm:min-h-[5.5rem] sm:p-2 ${
                  outside ? 'bg-surface-sunken/40' : 'hover:bg-brand-wash'
                } ${d.block ? 'bg-warn-soft/60' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${
                    d.isToday
                      ? 'bg-ink font-semibold text-white'
                      : outside
                        ? 'text-ink-mute'
                        : 'text-ink'
                  }`}
                >
                  {new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: 'numeric' }).format(date)}
                </span>

                {/* A phone gives each cell about 50px. "Fechado" and
                    "marcações" do not fit in that and spill into the next day,
                    so the small screen gets the figure and the colour and the
                    words start at sm. The cell is a link either way, and the
                    day it opens says it in full. */}
                {!outside && (
                  <span
                    className="mt-1 block text-xs leading-tight sm:hidden"
                    aria-label={
                      d.block
                        ? t.blocked
                        : d.open.length === 0
                          ? t.closed
                          : count > 0
                            ? `${count} ${count === 1 ? t.booking : t.bookings}`
                            : t.free
                    }
                  >
                    {d.block ? (
                      <span className="block h-1 w-5 rounded-full bg-warn" />
                    ) : d.open.length === 0 ? (
                      <span className="block h-1 w-5 rounded-full bg-line-strong" />
                    ) : count > 0 ? (
                      <span className="font-semibold text-ink">{count}</span>
                    ) : (
                      <span className="block h-1 w-5 rounded-full bg-ok/50" />
                    )}
                  </span>
                )}

                {!outside && (
                  <span className="mt-1 hidden text-xs leading-tight sm:block">
                    {d.block ? (
                      <span className="font-medium text-warn">{t.blocked}</span>
                    ) : d.open.length === 0 ? (
                      <span className="text-ink-mute">{t.closed}</span>
                    ) : count > 0 ? (
                      <span className="font-medium text-ink">
                        {count}{' '}
                        <span className="font-normal text-ink-soft">
                          {count === 1 ? t.booking : t.bookings}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ok">{t.free}</span>
                    )}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
      {legend}
      </>
    )
  }

  // --- Week -----------------------------------------------------------------
  //
  // Bookings, and nothing else.
  //
  // This used to draw a row per bookable time, so a clinic open twelve hours in
  // fifteen minute steps got forty-eight rows a day, of which forty said
  // "free". Seven of those side by side is a screen nobody can read and a page
  // that scrolls for ever, and the one thing a clinic opens this view to find
  // — what is actually happening on Thursday — was buried in the noise.
  //
  // Free time is now shown as a number and a bar rather than as a list. It is
  // the same fact, and it is the fact people want: not *which* forty are free
  // but *how* free the day is.
  const days = Array.from({ length: 7 }, (_, i) => dayIn(tz, i, anchor))

  // The catalogue only speaks the two languages Telma answers in. An English
  // panel reads the Portuguese label, which is better than reading an id.
  const labelLocale = locale === 'es' ? 'es' : 'pt'

  function categoryOf(a: Appointment) {
    const matched = resolveDuration(clinic, a.reason ?? null).service_id
    const cat = bookingCategory(matched, a.reason)
    return cat && { ...cat, label: matched ? serviceLabel(matched, labelLocale) : (a.reason ?? '') }
  }

  // What the colours mean, for the services this week actually contains. A key
  // listing everything the clinic offers would be longer than the week and
  // mostly about days that are not on screen.
  const key = new Map<string, { index: number | null; label: string }>()
  for (const date of days) {
    for (const a of dayState(date).appts) {
      const cat = categoryOf(a)
      if (cat && !key.has(cat.key)) key.set(cat.key, { index: cat.index, label: cat.label })
    }
  }

  return (
    <>
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
      {days.map((date) => {
        const d = dayState(date)
        const total = d.open.length
        const busy = d.appts.length
        const free = Math.max(0, total - busy)

        return (
          <li
            key={d.key}
            className={`card flex flex-col p-3 ${d.block ? 'bg-warn-soft/60' : ''}`}
          >
            <Link href={`/hoje?d=${d.key}`} className="block">
              <span className="label-caps">{dict.weekdays[d.dow].slice(0, 3)}</span>
              <span
                className={`mt-0.5 block text-lg font-semibold tabular-nums ${
                  d.isToday ? 'text-brand-accent' : 'text-ink'
                }`}
              >
                {new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: 'numeric' }).format(date)}
              </span>
            </Link>

            {d.block ? (
              <p className="mt-2 text-sm font-medium text-warn">
                {t.blocked}
                {d.block.reason && (
                  <span className="block font-normal text-ink-soft">{d.block.reason}</span>
                )}
              </p>
            ) : total === 0 ? (
              <p className="mt-2 text-sm text-ink-mute">{t.closed}</p>
            ) : (
              <>
                {/* How full the day is, in one line and one bar. The bar is
                    never the only carrier: the count is written beside it. */}
                <div className="mt-2">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-line"
                    role="img"
                    aria-label={`${busy} / ${total}`}
                  >
                    <div
                      className="h-full rounded-full bg-brand-accent"
                      style={{ width: `${total ? (busy / total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-sm text-ink-mute tabular-nums">
                    {busy > 0
                      ? fill(t.bookedOfTotal, { n: busy, total })
                      : fill(t.allFree, { n: free })}
                  </p>
                </div>

                <ul className="mt-2 flex min-w-0 flex-col gap-1">
                  {d.appts.map((a) => {
                    const cat = categoryOf(a)
                    return (
                      <li
                        key={a.id}
                        title={[timeIn(a.scheduled_at, locale, tz), a.patient_name, a.reason]
                          .filter(Boolean)
                          .join(' · ')}
                        style={{ backgroundColor: categoryBackground(cat?.index ?? null) }}
                        className="flex min-w-0 items-baseline gap-1.5 rounded-lg px-1.5 py-1 text-sm text-ink"
                      >
                        <span className="shrink-0 tabular-nums font-medium">
                          {timeIn(a.scheduled_at, locale, tz)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{a.patient_name}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </li>
        )
      })}
    </ol>

    {key.size > 1 && (
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">
        {[...key.values()].map((c) => (
          <li key={c.label} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: categoryBackground(c.index) }}
            />
            <span className="truncate">{c.label}</span>
          </li>
        ))}
      </ul>
    )}
    </>
  )

}

/** Fills `{n}` and `{total}` in a dictionary string. Dictionary entries are
 *  strings, never functions: they are handed whole to client components, and a
 *  function does not survive that crossing. */
function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole
  )
}
