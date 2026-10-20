import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import type { Call } from '@/lib/types'
import { Badge, CALL_TONE } from '@/components/ui'
import { DaySwitcher } from '@/components/clinic/DaySwitcher'
import { formatTime, formatDate } from '@/lib/format'
import { IconPhone, IconPhoneMissed, IconWhatsApp } from '@/components/icons'

/**
 * The day, for a clinic whose Telma does not book.
 *
 * ── WHY THIS SCREEN EXISTS ─────────────────────────────────────────────────
 * Hiding the diary from a clinic that only takes messages was right, and it
 * left them without the one screen everybody opens in the morning: what has
 * been going on. Conversations is a searchable archive with filters, which is
 * what you use when you are looking for something; this is what you use when
 * you are not looking for anything in particular and want to know how the day
 * has gone.
 *
 * So the first entry in the menu keeps its place and changes its meaning. It
 * is not a diary to confirm and cancel in: it is the answer to "what did
 * Telma do today", and under it, "and this week".
 *
 * ── WHY THE MESSAGE IS NOT BEHIND A CLICK ──────────────────────────────────
 * The list in Conversations folds each call away and opens it on demand,
 * which is right for an archive of hundreds. Here the message is the whole
 * point of the row: a clinic reading this wants the fifteen words Telma wrote
 * down, not a list of telephone numbers to open one by one.
 */
export function MessagesDay({
  calls,
  week,
  dayKey,
  todayKey,
  yesterdayKey,
  heading,
  dict,
  locale,
}: {
  /** The selected day's calls, newest first. */
  calls: Call[]
  /** One row per day of the last seven, oldest first. */
  week: Array<{ dayKey: string; label: string; answered: number; missed: number }>
  dayKey: string
  todayKey: string
  yesterdayKey: string
  /** The selected day, written out. */
  heading: string
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.agenda
  const answered = calls.filter((c) => c.result !== 'nao_atendida').length
  const missed = calls.filter((c) => c.result === 'nao_atendida').length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 className="text-xl font-semibold text-ink">{heading}</h2>
        {/* No tomorrow. This screen is about what has already happened, and a
            tab leading to a day that cannot have anything on it is a tab that
            teaches people the screen is broken. */}
        <DaySwitcher
          current={dayKey}
          today={todayKey}
          yesterday={yesterdayKey}
          labels={{ before: t.dayBefore, today: t.dayToday, pick: t.pickDay }}
        />
      </div>

      <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
        <span>
          <span className="font-mid text-ink">{answered}</span> {t.doneCalls.toLocaleLowerCase(locale)}
        </span>
        {missed > 0 && (
          <span className="text-warn">
            <span className="font-mid">{missed}</span> {t.doneMissed.toLocaleLowerCase(locale)}
          </span>
        )}
      </p>

      {calls.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-base text-ink-mute">
          {t.messagesEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {calls.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mid text-lg text-ink">{formatTime(c.created_at, locale)}</span>
                <span
                  className={c.channel === 'whatsapp' ? 'text-ok' : 'text-ink-mute'}
                  aria-label={dict.status.channel[c.channel]}
                >
                  {c.channel === 'whatsapp' ? (
                    <IconWhatsApp className="h-4 w-4" />
                  ) : (
                    <IconPhone className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-base text-ink-soft">
                  {c.patient_name || c.from_phone || dict.common.noNumber}
                </span>
                {c.result && <Badge tone={CALL_TONE[c.result]}>{dict.status.call[c.result]}</Badge>}
                {/* Nothing was said on a call nobody answered, so there is
                    nothing to open. */}
                {c.result !== 'nao_atendida' && (
                  <Link
                    href={`/conversas?c=${c.id}`}
                    className="text-sm text-brand-accent hover:text-brand-hover"
                  >
                    {dict.agenda.openConversation}
                  </Link>
                )}
              </div>
              {c.summary && (
                <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-ink">
                  {c.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── AND THE WEEK, IN ONE GLANCE ──────────────────────────────────────
          Seven rows and two numbers each. Not a chart: a clinic wants to know
          whether Wednesday was busy and what happened on the day they were
          short at the desk, and both are answered by a number and a way in. */}
      <section className="mt-10">
        <h3 className="mb-3 text-lg font-semibold text-ink">{t.weekTitle}</h3>
        <ul className="overflow-hidden rounded-card border border-line">
          {week.map((d) => {
            const here = d.dayKey === dayKey
            return (
              <li key={d.dayKey} className="border-b border-line last:border-b-0">
                <Link
                  href={d.dayKey === todayKey ? '/hoje' : `/hoje?d=${d.dayKey}`}
                  aria-current={here ? 'page' : undefined}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors ${
                    here ? 'bg-accent-wash' : 'bg-surface hover:bg-surface-sunken'
                  }`}
                >
                  <span className="min-w-0 flex-1 text-base text-ink">{d.label}</span>
                  {/* Two figures, each with the icon that says which it is.
                      "0 +3" needed a legend to be read; this does not. */}
                  <span
                    className="flex items-center gap-1.5 text-base text-ink-soft"
                    title={t.doneCalls}
                  >
                    <IconPhone className="h-4 w-4" />
                    {d.answered}
                    <span className="sr-only">{t.doneCalls}</span>
                  </span>
                  {d.missed > 0 && (
                    <span className="flex items-center gap-1.5 text-base text-warn" title={t.doneMissed}>
                      <IconPhoneMissed className="h-4 w-4" />
                      {d.missed}
                      <span className="sr-only">{t.doneMissed}</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

/** The day written as the week rows want it: "Quarta, 15/10". */
export function weekRowLabel(iso: string, locale: Locale, tz: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString(locale === 'pt' ? 'pt-PT' : locale === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long',
    timeZone: tz,
  })
  return `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}, ${formatDate(iso, locale)}`
}
