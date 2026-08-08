import { copyFor, stepOf } from '@/lib/onboarding/copy'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * Where you are, and how much is left.
 *
 * Two drawings of the same fact. On a phone it is a sentence and a rule,
 * because six labels at 375px are six illegible labels. From the small
 * breakpoint up it is the labelled steps, which answer the question the
 * sentence cannot: what is still coming.
 *
 * Nothing here is clickable. A step that looks tappable and is not is worse
 * than a step that never invited the tap, and jumping to step five before step
 * one has been answered has nothing to validate against.
 */
export function StepIndicator({
  current,
  locale,
}: {
  current: number
  locale: OnboardingLocale
}) {
  const STEPS = copyFor(locale).steps
  const total = STEPS.length
  const percent = Math.round(((current - 1) / (total - 1)) * 100)

  return (
    <div aria-hidden={false}>
      {/* The phone version. */}
      <div className="sm:hidden">
        <p className="label-caps">{stepOf(locale, current, total)}</p>
        <p className="mt-1 text-base font-medium text-ink">{STEPS[current - 1].title}</p>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-pill bg-brand-wash-strong">
          <div
            className="h-full rounded-pill bg-brand transition-all duration-500 ease-calm"
            style={{ width: `${Math.max(percent, 4)}%` }}
          />
        </div>
      </div>

      {/* The wide version. */}
      <ol className="hidden sm:flex sm:items-center sm:gap-1" role="list">
        {STEPS.map((step, i) => {
          const done = step.n < current
          const here = step.n === current
          return (
            <li key={step.n} className="flex flex-1 items-center gap-1 last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-sm font-medium transition-colors duration-fast ease-calm',
                    here
                      ? 'bg-brand text-white'
                      : done
                        ? 'bg-brand-wash-strong text-brand-accent'
                        : 'border border-line-strong bg-surface text-ink-mute',
                  ].join(' ')}
                >
                  {/* A tick for what is behind you: the number has stopped
                      being information once the step is answered. */}
                  {done ? '✓' : step.n}
                </span>
                <span
                  className={[
                    'text-sm',
                    here ? 'font-medium text-ink' : 'text-ink-mute',
                  ].join(' ')}
                >
                  {step.short}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={[
                    'mx-2 hidden h-px flex-1 md:block',
                    done ? 'bg-brand-accent/40' : 'bg-line',
                  ].join(' ')}
                />
              )}
            </li>
          )
        })}
      </ol>

      {/* Read out loud, for anyone who is not looking at either drawing. */}
      <p className="sr-only" role="status">
        {stepOf(locale, current, total)}: {STEPS[current - 1].title}
      </p>
    </div>
  )
}
