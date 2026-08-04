import Link from 'next/link'
import type { PlannerView } from './Planner'
import { IconChevron } from '@/components/icons'

/**
 * Week or month, and a step in either direction.
 *
 * Plain links, not buttons: paging through a calendar is navigation, so it
 * belongs in the URL. A clinic that wants to send "look at the week of the
 * 22nd" to a colleague can just send the address.
 */
export function PlannerNav({
  view,
  prevKey,
  nextKey,
  todayHref,
  label,
  labels,
}: {
  view: PlannerView
  prevKey: string
  nextKey: string
  todayHref: string
  /** The week or month currently on screen, already formatted. */
  label: string
  labels: {
    week: string
    month: string
    prev: string
    next: string
    thisOne: string
  }
}) {
  const tab = (value: PlannerView, text: string) => (
    <Link
      href={`/horarios?v=${value}`}
      aria-current={view === value ? 'page' : undefined}
      className={`inline-flex min-h-[2.5rem] items-center rounded-pill px-4 text-base font-medium transition-colors ${
        view === value ? 'bg-ink text-white' : 'text-ink-soft hover:bg-brand-wash hover:text-ink'
      }`}
    >
      {text}
    </Link>
  )

  const step = (key: string, text: string, back?: boolean) => (
    <Link
      href={`/horarios?v=${view}&p=${key}`}
      aria-label={text}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-ink-soft hover:border-ink hover:text-ink"
    >
      <IconChevron className={`h-5 w-5 ${back ? 'rotate-180' : ''}`} />
    </Link>
  )

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {step(prevKey, labels.prev, true)}
        {/* first-letter:uppercase because Portuguese and Spanish month names
            come back lower case from Intl, and a heading should not. */}
        <span className="min-w-[9rem] text-lg font-semibold text-ink first-letter:uppercase">
          {label}
        </span>
        {step(nextKey, labels.next)}
        <Link
          href={todayHref}
          className="ml-1 text-base text-brand-accent hover:text-brand-hover"
        >
          {labels.thisOne}
        </Link>
      </div>

      <div className="inline-flex rounded-pill border border-line-strong bg-surface p-1">
        {tab('semana', labels.week)}
        {tab('mes', labels.month)}
      </div>
    </div>
  )
}
