'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import type { SetupStep } from '@/lib/clinic-setup'
import { activateClinic } from '@/lib/actions/activate'
import { IconCheck } from '@/components/icons'

/**
 * The first thing a new clinic sees, and the only thing until it is done.
 *
 * It replaces the day rather than sitting above it. A clinic in this state has
 * no hours and no services, so the agenda underneath would be an empty list
 * under a full screen of counters reading zero — which looks like a product
 * that does not work rather than one that has not been set up.
 *
 * Two things and not ten. The list is short on purpose: everything else Telma
 * needs has a safe default, and a checklist that includes what does not matter
 * teaches people to click through checklists.
 *
 * The button is disabled until both are done. That is a courtesy to the
 * reader; the rule lives in the action, which checks the same list again.
 */
export function SetupGate({
  steps,
  dict,
  forwarding = false,
}: {
  steps: SetupStep[]
  dict: Dictionary
  /**
   * True for a clinic that kept its own number, which has a third thing to do
   * that this screen cannot list as a step: the forward.
   *
   * It is not in the list because the list is things we can check and that
   * gate the button, and the forward is neither. It cannot be checked -- it
   * lives in an operator's switch -- and it must not gate activation, because
   * it has to happen *after*: forwarding a real telephone into a Telma who has
   * not been told the opening hours sends patients to a receptionist who
   * cannot answer them.
   *
   * But leaving it unmentioned made this screen promise a two-step job that
   * is really three, and the third one arrived as a surprise on the agenda.
   */
  forwarding?: boolean
}) {
  const t = dict.setup
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const ready = steps.every((s) => s.done)

  return (
    <section className="card p-6 sm:p-8">
      <p className="label-caps text-brand-accent">{t.eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{t.title}</h2>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">
        {forwarding ? t.leadKeep : t.lead}
      </p>

      <ol className="mt-6 flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                s.done ? 'bg-ok text-white' : 'border border-line-strong text-ink-mute'
              }`}
              aria-hidden
            >
              {s.done ? <IconCheck className="h-4 w-4" /> : null}
            </span>
            <span className={`text-lg ${s.done ? 'text-ink-mute line-through' : 'text-ink'}`}>
              {t.steps[s.id]}
            </span>
            {!s.done && (
              <Link href={s.href} className="text-base text-brand-accent hover:text-brand-hover">
                {t.go}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {forwarding && (
        <p className="mt-5 max-w-prose rounded-card border-l-[3px] border-accent bg-surface-sunken px-4 py-3 text-base leading-relaxed text-ink">
          {t.thenForward}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => {
            setFailed(false)
            start(async () => {
              const r = await activateClinic()
              if (!r.ok) setFailed(true)
            })
          }}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? t.activating : t.activate}
        </button>
        {/* Why it is disabled, beside it. A greyed button with no reason is a
            dead end, and the reason is the whole content of this screen. */}
        {!ready && <span className="text-base text-ink-mute">{t.notYet}</span>}
        {failed && (
          <span role="alert" className="text-base text-danger">
            {t.failed}
          </span>
        )}
      </div>
    </section>
  )
}
