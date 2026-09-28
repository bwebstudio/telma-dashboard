import type { Dictionary } from '@/content'
import { fill } from '@/lib/fill'
import { needsAnswer, type DayFacts } from '@/lib/agenda-facts'

/**
 * How full a day is, and whether it is asking for anything.
 *
 * One component for the day view and for each card in the week, so the same
 * fact is not phrased two ways at two zooms. It was in the week only: the day
 * view — the screen a clinic actually opens every morning — was the one place
 * that could not say "eight of eight taken".
 *
 * The bar is never the only carrier. The count is written beside it, in the
 * same sentence whichever view is drawing it: a screen that says "1 de 6
 * ocupadas" in one place and "6 horas libres" in another makes the reader
 * convert between two units to compare two days.
 */
export function DayLoad({
  facts,
  dict,
  /** Bigger type for the day view, where this is a heading rather than a line
   *  inside a card. */
  large = false,
}: {
  facts: DayFacts
  dict: Dictionary
  large?: boolean
}) {
  if (facts.blocked || facts.closed) return null

  return (
    <div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`${facts.busy} / ${facts.total}`}
      >
        <div
          className="h-full rounded-full bg-brand-accent"
          style={{ width: `${facts.total ? (facts.busy / facts.total) * 100 : 0}%` }}
        />
      </div>
      <p className={`mt-1.5 tabular-nums text-ink-mute ${large ? 'text-base' : 'text-sm'}`}>
        {fill(dict.horarios.bookedOfTotal, { n: facts.busy, total: facts.total })}
      </p>
      {/* The line no zoom is allowed to drop. */}
      {needsAnswer(facts) && (
        <p className={`mt-1 font-medium text-warn ${large ? 'text-base' : 'text-sm'}`}>
          {[
            facts.pending > 0 && fill(dict.agenda.pendingCount, { n: facts.pending }),
            facts.cancelled > 0 && fill(dict.agenda.cancelledCount, { n: facts.cancelled }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
