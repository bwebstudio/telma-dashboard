'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { FORWARD_UNDO, forwardCodes, type ForwardType } from '@/lib/forwarding'
import { markForwardingDone } from '@/lib/actions/forwarding'

/**
 * The one thing the sign-up promised and the product never did.
 *
 * A clinic that kept its own number has to point it at ours, and until it
 * does, Telma answers a line nobody calls. The sign-up sells this as five
 * minutes of work ("le ayudamos a configurar el desvío"), and the help was a
 * sentence: no codes anywhere in the product, nothing in the panel, and a
 * welcome email that announced a portability nobody had started.
 *
 * It is a card and not a step in SetupGate because we cannot tell whether it
 * is done. The gate's steps are facts we can read -- hours exist, services
 * exist -- and a forward lives in an operator's switch where we have no eyes.
 * So the clinic says when it is done, and until then the card stays.
 *
 * `dismissable` is what separates the two places this appears. On the agenda
 * it is a task, and a task that cannot be put away is an alarm. Under Conta it
 * is reference, kept because somebody changes operator, or a receptionist
 * cancels every forward on the line by dialling ##002# for an unrelated
 * reason, and then needs these digits again a year later.
 */
export function ForwardingCard({
  toNumber,
  forwardType,
  dict,
  dismissable = false,
  readOnly = false,
}: {
  /** The number Telma answers on: the destination of the forward. */
  toNumber: string
  forwardType: ForwardType | null
  dict: Dictionary
  dismissable?: boolean
  readOnly?: boolean
}) {
  const t = dict.forwarding
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const codes = forwardCodes(toNumber, forwardType)
  if (!codes.length) return null

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
      <h2 className="mt-2 text-xl font-semibold text-ink">{t.title}</h2>
      <p className="mt-2 max-w-prose text-base text-ink-soft">
        {t.lead.replace('{n}', toNumber)}
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {codes.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-sunken px-4 py-3"
          >
            <span>
              <span className="label-caps block text-ink-mute">{t.codes[c.id]}</span>
              <span className="mt-1 block font-mono text-lg font-semibold tabular-nums text-ink">
                {c.code}
              </span>
            </span>
            <button
              type="button"
              onClick={() => copy(c.code)}
              className="btn-ghost min-h-0 px-2 py-1 text-sm"
            >
              {copied === c.code ? t.copied : t.copy}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-ink-mute">
        {t.undo.replace('{code}', FORWARD_UNDO)}
      </p>
      <p className="mt-2 text-sm text-ink-mute">{t.fixedLine}</p>

      {dismissable && !readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
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
