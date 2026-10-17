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
 * ── WHY IT READS AS ONE TASK AND NOT AS THREE ─────────────────────────────
 * The first version printed three codes as three equal rows, each with its own
 * heading: "when nobody answers", "when busy", "when out of range". It looked
 * like a menu to choose from. It is not one: all three have to be dialled, and
 * a clinic that dials only the first still sends patients the engaged tone.
 *
 * So the three are numbered steps of one job, under one sentence that says why
 * there are three of them. The technical fact -- that a telephone distinguishes
 * three ways of not answering -- is ours and not theirs, but it has to be said,
 * because otherwise three codes for one thing reads as a mistake.
 *
 * Both numbers are named in the lead, with what each is for. Without that the
 * reader has two phone numbers on screen and no idea which one is theirs,
 * which is exactly how somebody ends up dialling their own number into the
 * code and forwarding their line to itself.
 *
 * `dismissable` separates the two places this appears. On the agenda it is a
 * task, and a task that cannot be put away is an alarm. Under Conta it is
 * reference, kept because somebody changes operator, or a receptionist cancels
 * every forward on the line by dialling ##002# for an unrelated reason.
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

  const lead = (forwardType === 'all' ? t.leadAll : t.leadKeep)
    .replace('{own}', ownNumber ?? '—')
    .replace('{telma}', telmaNumber)

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
      <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-soft">{lead}</p>

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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-medium text-white"
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

      {/* Before the reassurance, because it is the one thing that stops the
          forward working at all. */}
      <p className="mt-4 max-w-prose text-sm text-ink">
        {t.mustMatch.replace('{own}', ownNumber ?? '—')}
      </p>

      <p className="mt-3 max-w-prose text-sm text-ink-soft">{t.reassure}</p>
      <p className="mt-1 text-sm text-ink-mute">{t.undo.replace('{code}', FORWARD_UNDO)}</p>
      <p className="mt-3 max-w-prose text-sm text-ink-mute">{t.fixedLine}</p>

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
