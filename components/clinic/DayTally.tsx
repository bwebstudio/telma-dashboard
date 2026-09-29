import Link from 'next/link'
import type { Dictionary } from '@/content'
import { IconPhone, IconWhatsApp, IconBookings, IconCheck, IconClose } from '@/components/icons'

/**
 * What Telma did today, in one line.
 *
 * It was five cards across the top of the screen, above everything, and that
 * put the day — which is what the screen exists for — below the fold. Five
 * boxes is the shape of a dashboard whose subject is its numbers. This
 * screen's subject is the day; the numbers are how it has gone so far.
 *
 * So: one line, under the day and not over it, readable in a glance and
 * ignorable in the same glance. Nothing is lost — the same five figures, the
 * same link to the conversations.
 *
 * A zero is drawn rather than hidden. "Zero cancellations" is information a
 * clinic wants at six in the evening, and a row that changes shape as the day
 * goes on is a row nobody learns to read.
 */
export function DayTally({
  counts,
  whatsapp,
  dict,
}: {
  counts: { calls: number; whatsapp: number; bookings: number; info: number; cancelled: number }
  /** Only for clinics that pay for it. Everyone else never had the channel. */
  whatsapp: boolean
  dict: Dictionary
}) {
  const t = dict.agenda
  const items = [
    { icon: <IconPhone className="h-4 w-4" />, label: t.doneCalls, value: counts.calls },
    ...(whatsapp
      ? [{ icon: <IconWhatsApp className="h-4 w-4" />, label: t.doneWhatsapp, value: counts.whatsapp }]
      : []),
    { icon: <IconBookings className="h-4 w-4" />, label: t.doneBookings, value: counts.bookings },
    { icon: <IconCheck className="h-4 w-4" />, label: t.doneInfo, value: counts.info },
    {
      icon: <IconClose className="h-4 w-4" />,
      label: t.doneCancelled,
      value: counts.cancelled,
      warn: counts.cancelled > 0,
    },
  ]

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-ink-soft">
      <span className="label-caps text-ink-mute">{t.doneTitle}</span>
      {items.map((it) => (
        <span key={it.label} className={`inline-flex items-center gap-1.5 ${'warn' in it && it.warn ? 'text-warn' : ''}`}>
          {it.icon}
          <span className="font-semibold tabular-nums text-ink">{it.value}</span>
          {it.label}
        </span>
      ))}
      <Link href="/conversas" className="text-brand-accent hover:text-brand-hover">
        {t.seeConversations}
      </Link>
    </div>
  )
}
