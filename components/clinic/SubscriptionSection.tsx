'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { FORWARD_UNDO } from '@/lib/forwarding'
import {
  cancelErasure,
  cancelService,
  keepService,
  pauseService,
  requestErasure,
  resumeService,
} from '@/lib/actions/service'
import { ERASURE_GRACE_DAYS, PAUSE_MONTHS } from '@/lib/service-limits'

/**
 * Managing the subscription, and one thing that is not the subscription.
 *
 * ── WHY THE ORDER IS THE ORDER ─────────────────────────────────────────────
 * Pausing, cancelling and erasing are three decisions with three different
 * costs, and the first version drew the first two side by side, as a pair of
 * equivalent choices, with erasure pressed up against them. Side by side is a
 * claim: it says these two are the same kind of thing. They are not. So they
 * are stacked, cheapest first, and erasure is below a wide rule because it is
 * not subscription management at all -- it is an act on personal data, and it
 * should look like one.
 *
 * ── WHY THE FORWARDING NOTICE IS NOT AT THE TOP ───────────────────────────
 * It used to be, where it read as an instruction to somebody who had done
 * nothing yet: open the page, and the product appears to be telling you to
 * dial a code. Worse, a clinic that followed it would cut its own line off
 * weeks before the service it had paid for ran out.
 *
 * It belongs after the decision, and it has to say *when*: on the last paid
 * day for somebody leaving, and right away for somebody pausing, who also has
 * to be told they will have to set the forward up again when they return.
 *
 * ── WHY A DIALOG AND NOT window.confirm ───────────────────────────────────
 * The browser's own box cannot say the date, and the date is the whole
 * content of this confirmation: "until the 16th of November" is what makes
 * cancelling an informed decision rather than a leap.
 */
export function SubscriptionSection({
  status,
  pausedUntil,
  renewsAt,
  cancelEffectiveAt,
  deletionRequestedAt,
  readOnly,
  locale,
  dict,
}: {
  status: string
  pausedUntil: string | null
  /** The end of what has been paid for, known before anybody cancels. Null
   *  for a clinic with no subscription at Stripe, where the sentence has to
   *  manage without a date. */
  renewsAt: string | null
  cancelEffectiveAt: string | null
  deletionRequestedAt: string | null
  /** An administrator visiting. Deciding that a clinic leaves is the
   *  clinic's decision, so a visitor sees the state and no buttons. */
  readOnly: boolean
  locale: string
  dict: Dictionary
}) {
  const t = dict.subscription
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const [asking, setAsking] = useState<'cancel' | 'erase' | null>(null)
  const [reason, setReason] = useState('')

  const paused = status === 'pausada' && Boolean(pausedUntil)
  const leaving = Boolean(cancelEffectiveAt)
  const erasing = Boolean(deletionRequestedAt)

  const day = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'pt-PT', { dateStyle: 'long' }).format(
          new Date(iso)
        )
      : ''

  // Before cancelling it is the renewal date; afterwards it is the date
  // Stripe gave back. They are the same day, and the second is the one that
  // has been agreed rather than predicted.
  const endsOn = cancelEffectiveAt ?? renewsAt
  const erasesOn = deletionRequestedAt
    ? day(
        new Date(
          new Date(deletionRequestedAt).getTime() + ERASURE_GRACE_DAYS * 86400_000
        ).toISOString()
      )
    : ''

  function run(fn: () => Promise<{ ok: boolean }>) {
    setFailed(false)
    setAsking(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setFailed(true)
    })
  }

  return (
    <section className="card p-6 lg:col-span-2">
      <h2 className="text-xl font-semibold text-ink">{t.title}</h2>
      <p className="mt-2 max-w-prose text-base text-ink-soft">{t.lead}</p>

      {/* ── PAUSE ─────────────────────────────────────────────────────────── */}
      <div className="mt-7">
        <h3 className="text-base font-semibold text-ink">{t.pauseTitle}</h3>
        <p className="mt-1 max-w-prose text-base text-ink-soft">{t.pauseHelp}</p>

        {paused ? (
          <>
            <p className="mt-3 text-base font-medium text-ink">
              {t.pausedUntil.replace('{date}', day(pausedUntil))}
            </p>
            <ForwardNote title={t.forwardTitle} body={t.forwardAfterPause} />
            {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(resumeService)}
                className="btn-secondary mt-3 min-h-0 px-4 py-2 text-sm"
              >
                {t.resume}
              </button>
            )}
          </>
        ) : (
          !readOnly &&
          !leaving && (
            <div className="mt-3 flex flex-wrap gap-2">
              {PAUSE_MONTHS.map((months) => (
                <form key={months} action={(fd) => run(() => pauseService(fd))}>
                  <input type="hidden" name="months" value={months} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="btn-secondary min-h-0 px-4 py-2 text-sm"
                  >
                    {months === 1 ? t.pauseOne : t.pauseMany.replace('{n}', String(months))}
                  </button>
                </form>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── CANCELLING ────────────────────────────────────────────────────── */}
      <div className="mt-8 border-t border-line pt-7">
        <h3 className="text-base font-semibold text-ink">{t.cancelTitle}</h3>

        {leaving ? (
          <>
            <p className="mt-1 text-base font-medium text-ink">
              {endsOn ? t.cancelled.replace('{date}', day(endsOn)) : t.cancelledNoDate}
            </p>
            <ForwardNote
              title={t.forwardTitle}
              body={
                endsOn
                  ? t.forwardAfterCancel.replace('{date}', day(endsOn))
                  : t.forwardAfterCancelNoDate
              }
            />
            {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(keepService)}
                className="btn-secondary mt-3 min-h-0 px-4 py-2 text-sm"
              >
                {t.keep}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 max-w-prose text-base text-ink-soft">
              {renewsAt ? t.cancelHelp.replace('{date}', day(renewsAt)) : t.cancelHelpNoDate}
            </p>

            {!readOnly && (
              <div className="mt-4 max-w-prose">
                <label htmlFor="cancel-reason" className="field-label">
                  {t.reasonLabel}{' '}
                  <span className="font-normal text-ink-mute">({t.reasonOptional})</span>
                </label>
                <textarea
                  id="cancel-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t.reasonPlaceholder}
                  className="input w-full"
                />
                <p className="mt-1 text-sm text-ink-mute">{t.reasonHelp}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setAsking('cancel')}
                  className="btn-ghost mt-3 min-h-0 px-4 py-2 text-sm text-danger"
                >
                  {t.cancelAction}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── AND THE PART THAT IS NOT ABOUT THE SUBSCRIPTION ───────────────── */}
      <div className="mt-10 border-t-2 border-line-strong pt-7">
        <h3 className="text-base font-semibold text-ink">{t.eraseTitle}</h3>
        <p className="mt-1 max-w-prose text-base text-ink-soft">{t.eraseHelp}</p>
        <p className="mt-2 max-w-prose text-base text-ink-soft">{t.eraseRetention}</p>

        {erasing ? (
          <>
            <p className="mt-3 text-base font-medium text-danger">
              {t.erasePending.replace('{date}', erasesOn)}
            </p>
            {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(cancelErasure)}
                className="btn-secondary mt-2 min-h-0 px-4 py-2 text-sm"
              >
                {t.eraseKeep}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 max-w-prose text-sm text-ink-mute">
              {t.eraseGrace.replace('{days}', String(ERASURE_GRACE_DAYS))}
            </p>
            {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setAsking('erase')}
                className="btn-ghost mt-3 min-h-0 px-4 py-2 text-sm text-danger"
              >
                {t.eraseAction}
              </button>
            )}
          </>
        )}
      </div>

      {failed && (
        <p role="alert" className="mt-5 text-base font-medium text-danger">
          {t.failed}
        </p>
      )}

      {asking && (
        <Confirm
          title={asking === 'cancel' ? t.cancelConfirmTitle : t.eraseConfirmTitle}
          body={
            asking === 'cancel'
              ? renewsAt
                ? t.cancelConfirmBody.replace('{date}', day(renewsAt))
                : t.cancelConfirmBodyNoDate
              : t.eraseConfirmBody.replace('{days}', String(ERASURE_GRACE_DAYS))
          }
          confirmLabel={asking === 'cancel' ? t.cancelConfirmGo : t.eraseConfirmGo}
          backLabel={t.back}
          pending={pending}
          onBack={() => setAsking(null)}
          onConfirm={() => {
            if (asking === 'erase') return run(requestErasure)
            const fd = new FormData()
            fd.set('reason', reason)
            run(() => cancelService(fd))
          }}
        />
      )}
    </section>
  )
}

/** Said once a decision has been made, and never before: on the page it read
 *  as an instruction to somebody who had done nothing yet. */
function ForwardNote({ title, body }: { title: string; body: string }) {
  const [before, after] = body.split('{code}')
  return (
    <div className="mt-4 max-w-prose rounded-card border border-line-strong bg-surface-sunken p-4">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-base text-ink-soft">
        {before}
        <span className="font-mono text-lg font-semibold text-ink">{FORWARD_UNDO}</span>
        {after}
      </p>
    </div>
  )
}

function Confirm({
  title,
  body,
  confirmLabel,
  backLabel,
  pending,
  onBack,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  backLabel: string
  pending: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="absolute inset-0 cursor-default bg-dark/55"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-hero bg-surface p-6 shadow-3"
      >
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={onBack} disabled={pending} className="btn-secondary">
            {backLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="btn-ghost text-danger"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
