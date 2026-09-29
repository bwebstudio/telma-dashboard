import Link from 'next/link'
import type { Dictionary } from '@/content'
import { fill } from '@/lib/fill'

/**
 * A line saying there is work on other days, and where it lives.
 *
 * There used to be a band here with the bookings themselves and a Confirmar on
 * each one. That made confirming a thing you did in two different places
 * depending on the date: in the day for today, in the band for anything else.
 * The same action, split, with no rule a reader could learn.
 *
 * One action, one place. The day answers for the day on screen -- the button
 * is on the row, beside the hour it is at. Everything else belongs to
 * Marcações, which is that screen's whole job and says so: "Telma leaves the
 * bookings here. Confirm each one and pass it to the clinic's software."
 *
 * What is left here is the part the band was actually for: making sure an
 * unanswered booking cannot rot unseen. A count and a way there. It says how
 * many and it does not repeat them, because repeating them is how this screen
 * got confusing in the first place.
 */
export function ElsewhereNote({
  pending,
  cancelled,
  dict,
}: {
  /** Bookings waiting on the clinic that are NOT on the day being shown. */
  pending: number
  /** Cancellations nobody has acknowledged, likewise elsewhere. */
  cancelled: number
  dict: Dictionary
}) {
  const t = dict.agenda
  if (pending + cancelled === 0) return null

  const parts = [
    pending > 0 ? fill(pending === 1 ? t.elsewhereOnePending : t.elsewherePending, { n: pending }) : null,
    cancelled > 0
      ? fill(cancelled === 1 ? t.elsewhereOneCancelled : t.elsewhereCancelled, { n: cancelled })
      : null,
  ].filter(Boolean)

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line bg-surface-sunken px-4 py-3 text-base text-ink-soft">
      <span>{parts.join(' · ')}</span>
      <Link href="/marcacoes?f=pending" className="text-brand-accent hover:text-brand-hover">
        {t.elsewhereGo}
      </Link>
    </div>
  )
}
