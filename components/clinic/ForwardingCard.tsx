'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { FORWARD_UNDO, forwardCodes, type ForwardType } from '@/lib/forwarding'
import { markForwardingDone } from '@/lib/actions/forwarding'

/**
 * The one thing the sign-up promised and the product never did.
 *
 * A clinic that kept its own number has to point it at ours, and until it
 * does, Telma sits on a number nobody rings.
 *
 * ── THE ORDER IS THE WHOLE DESIGN ─────────────────────────────────────────
 * What is going to happen, what I have to do, the codes, how to undo it, and
 * the exception. In that order, because the first version answered a question
 * nobody had asked yet: it opened by explaining how forwarding works, which
 * made something simple read as something complicated, and the instruction
 * was three paragraphs down.
 *
 * What went with it was every sentence explaining the machinery. "The
 * telephone distinguishes three ways of not being able to answer" is true and
 * it is ours to know; what the clinic needs is that there are three codes and
 * what each one covers. "That is how Telma knows the call is yours" became
 * plain instruction: dial it from this line.
 *
 * ── AND THE ANSWER TO THE QUESTION THEY ACTUALLY HAVE ─────────────────────
 * "After I dial these, what happens to my telephone?" It has its own block,
 * after the codes, where somebody who has just dialled them is looking: the
 * number does not change, patients ring it as always, Telma only takes what
 * you could not.
 *
 * `dismissable` separates the two places this appears. On the agenda it is a
 * task, and a task that cannot be put away is an alarm. Under Conta it is
 * reference, kept because somebody changes operator, or a receptionist
 * cancels every forward on the line by dialling ##002# for an unrelated
 * reason.
 */
export function ForwardingCard({
  telmaNumber,
  ownNumber,
  forwardType,
  dict,
  dismissable = false,
  readOnly = false,
}: {
  /** The hidden number we bought: where the call is sent. */
  telmaNumber: string
  /** The clinic's own public number: where the call arrives first. */
  ownNumber: string | null
  forwardType: ForwardType | null
  dict: Dictionary
  dismissable?: boolean
  readOnly?: boolean
}) {
  const t = dict.forwarding
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const codes = forwardCodes(telmaNumber, forwardType)
  if (!codes.length) return null

  const all = forwardType === 'all'
  const own = ownNumber ?? '—'

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000)
    } catch {
      /* Some browsers refuse it. The code is on screen either way, which is
         what matters: this button is a convenience, not the mechanism. */
    }
  }

  return (
    <section className="card p-6">
      <p className="label-caps text-ink-mute">{t.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-ink">{all ? t.titleAll : t.titleKeep}</h2>

      {/* What is going to happen. */}
      <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-soft">
        {(all ? t.leadAll : t.leadKeep).replace('{own}', own)}
      </p>

      {/* What I have to do. */}
      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink">
        {codes.length > 1 ? t.stepsIntroMany : t.stepsIntroOne}
      </p>

      <ol className="mt-4 flex flex-col gap-2">
        {codes.map((c, i) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-surface-sunken px-4 py-3"
          >
            {codes.length > 1 && (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-medium text-on-ink"
                aria-hidden
              >
                {i + 1}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink-soft">{t.codes[c.id]}</span>
              <span className="mt-0.5 block font-mono text-lg font-semibold tabular-nums text-ink">
                {c.code}
              </span>
            </span>
            <button
              type="button"
              onClick={() => copy(c.code)}
              className="btn-ghost min-h-0 shrink-0 px-2 py-1 text-sm"
            >
              {copied === c.code ? t.copied : t.copy}
            </button>
          </li>
        ))}
      </ol>

      {/* ── AND THEN WHAT? ───────────────────────────────────────────────────
          The question somebody has while dialling, answered where they will
          be looking when they finish. */}
      <div className="mt-5 rounded-card border border-ok/30 bg-ok-soft px-4 py-3">
        <p className="font-medium text-ink">{t.doneTitle}</p>
        <p className="mt-1 max-w-prose text-base leading-relaxed text-ink-soft">
          {all ? t.doneBodyAll : t.doneBodyKeep}
        </p>
      </div>

      {/* The one thing that stops the forward working at all. */}
      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink">
        {t.mustMatch.replace('{own}', own)}
      </p>

      <div className="mt-5 flex flex-col gap-4 text-sm text-ink-soft sm:flex-row sm:gap-8">
        <p className="max-w-prose">
          <span className="block font-medium text-ink">{t.undoTitle}</span>
          {t.undoBody.split('{code}')[0]}
          <span className="font-mono font-semibold text-ink">{FORWARD_UNDO}</span>
          {t.undoBody.split('{code}')[1]}
        </p>
        <p className="max-w-prose">
          <span className="block font-medium text-ink">{t.fixedTitle}</span>
          {t.fixedBody}
        </p>
      </div>

      {dismissable && !readOnly && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setFailed(false)
                const r = await markForwardingDone()
                if (!r.ok) setFailed(true)
              })
            }
            className="btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            {pending ? t.savingDone : t.markDone}
          </button>
          {failed && (
            <span role="alert" className="text-sm text-danger">
              {t.failed}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
