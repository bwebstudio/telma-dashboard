import Link from 'next/link'
import type { Dictionary } from '@/content'
import type { SetupStep } from '@/lib/clinic-setup'
import { IconCheck } from '@/components/icons'

/**
 * What is left before Telma can answer, and the fact that she is not.
 *
 * ── THREE, AND THEY ARE THE REAL THREE ────────────────────────────────────
 * The list is `setupSteps`, which is also what the activate button is checked
 * against, so the screen cannot promise a different number of things from the
 * one the rule counts. A checklist with a step the product does not enforce
 * teaches people to click through checklists.
 *
 * One of the three is not the clinic's: the line is ordered through the
 * operator and takes days. It is on the list anyway, because a button that
 * will not light up needs a reason beside it, and "we are on it" is a reason
 * a person can accept.
 */
export function SetupChecklist({
  steps,
  clinicName,
  dict,
}: {
  steps: SetupStep[]
  clinicName: string
  dict: Dictionary
}) {
  const t = dict.comecar
  const done = steps.filter((s) => s.done).length

  return (
    <section className="mb-8">
      <p className="label-caps text-ink-mute">{t.eyebrow}</p>
      <h1 className="h-display mt-2 text-3xl sm:text-4xl">
        {t.greeting.replace('{clinic}', clinicName)}
      </h1>
      <p className="mt-3 max-w-lead text-lg text-ink-soft">{t.title}</p>
      <p className="mt-2 max-w-prose text-base text-ink-soft">{t.lead}</p>

      {/* ── IS SHE ANSWERING? ─────────────────────────────────────────────
          Said plainly, at the top, because it is the question this screen
          exists under and the old one left to be inferred from an empty
          agenda. */}
      <div className="mt-6 rounded-card border border-line-strong bg-surface-sunken p-4">
        <p className="flex items-center gap-2 font-medium text-ink">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-warn" />
          {t.statusOff}
        </p>
        <p className="mt-1 max-w-prose text-base text-ink-soft">{t.statusOffHelp}</p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <p className="label-caps text-ink-mute">
          {t.progress.replace('{done}', String(done)).replace('{total}', String(steps.length))}
        </p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-wash" role="presentation">
          <div
            className="h-full rounded-full bg-ok transition-[width] duration-slow ease-calm"
            style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
          />
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step) => {
          const copy = t.steps[step.id]
          return (
            <li
              key={step.id}
              className={`flex flex-wrap items-start gap-3 rounded-card border p-4 ${
                step.done ? 'border-line bg-surface' : 'border-line-strong bg-surface'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  step.done ? 'bg-ok text-on-ink' : 'border border-line-strong text-ink-mute'
                }`}
              >
                {step.done && <IconCheck className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{copy.title}</span>
                <span className="mt-0.5 block text-base text-ink-soft">{copy.body}</span>
              </span>
              <span className="shrink-0 text-sm text-ink-mute">
                {step.done ? t.stepDone : step.href ? t.stepTodo : t.stepWaiting}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
