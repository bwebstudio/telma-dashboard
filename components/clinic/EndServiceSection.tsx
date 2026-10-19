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
 * The door out.
 *
 * ── WHY IT IS IN THE PANEL AT ALL ──────────────────────────────────────────
 * A clinic that wants to stop had to write to us and one that wanted its data
 * gone had no answer at all, which is a right it has rather than a favour we
 * do. Hiding the door does not keep anybody: it loses the clinic anyway and
 * loses the reason with it.
 *
 * ── WHY THREE DOORS AND NOT ONE ────────────────────────────────────────────
 * Pausing keeps everything and stops the money. Ending keeps the data until
 * the end of what was paid for. Erasing destroys it, a month later. One
 * button for all three would mean somebody closing for August and losing a
 * year of their patients' history.
 *
 * ── AND THE PART WE CANNOT DO FOR THEM ─────────────────────────────────────
 * None of this undoes the forward on the clinic's own line. Only the clinic
 * can, from its own telephone, and until it does its patients ring a line
 * that no longer answers for it. So the code is on this screen before either
 * irreversible button, not after, and not in an email they may never open.
 */
export function EndServiceSection({
  status,
  pausedUntil,
  cancelEffectiveAt,
  deletionRequestedAt,
  readOnly,
  locale,
  dict,
}: {
  status: string
  pausedUntil: string | null
  cancelEffectiveAt: string | null
  deletionRequestedAt: string | null
  /** An administrator visiting. Deciding that a clinic leaves is the
   *  clinic's decision, so a visitor sees the state and no buttons. */
  readOnly: boolean
  locale: string
  dict: Dictionary
}) {
  const t = dict.endService
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const [reason, setReason] = useState('')

  const paused = status === 'pausada' && Boolean(pausedUntil)
  const leaving = Boolean(cancelEffectiveAt)
  const erasing = Boolean(deletionRequestedAt)

  const day = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'pt-PT', { dateStyle: 'long' }).format(new Date(iso)) : ''

  const erasesOn = deletionRequestedAt
    ? day(new Date(new Date(deletionRequestedAt).getTime() + ERASURE_GRACE_DAYS * 86400_000).toISOString())
    : ''

  function run(fn: () => Promise<{ ok: boolean }>) {
    setFailed(false)
    start(async () => {
      const r = await fn()
      if (!r.ok) setFailed(true)
    })
  }

  return (
    <section className="card p-6 lg:col-span-2">
      <h2 className="text-xl font-semibold text-ink">{t.title}</h2>
      <p className="mt-2 max-w-prose text-base text-ink-soft">{t.lead}</p>

      {/* ── THE CODE, BEFORE EITHER BUTTON ──────────────────────────────── */}
      <div className="mt-5 rounded-card border border-line-strong bg-surface-sunken p-4">
        <p className="font-medium text-ink">{t.forwardTitle}</p>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {t.forwardBody.split('{code}')[0]}
          <span className="font-mono text-lg font-semibold text-ink">{FORWARD_UNDO}</span>
          {t.forwardBody.split('{code}')[1]}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── PAUSE ─────────────────────────────────────────────────────── */}
        <div>
          <h3 className="font-medium text-ink">{t.pauseTitle}</h3>
          <p className="mt-1 max-w-prose text-base text-ink-soft">{t.pauseHelp}</p>

          {paused ? (
            <div className="mt-3">
              <p className="text-base font-medium text-ink">
                {t.pausedUntil.replace('{date}', day(pausedUntil))}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(resumeService)}
                  className="btn-secondary mt-2 min-h-0 px-4 py-2 text-sm"
                >
                  {t.resume}
                </button>
              )}
            </div>
          ) : (
            !readOnly &&
            !leaving && (
              <div className="mt-3 flex flex-wrap gap-2">
                {PAUSE_MONTHS.map((months) => (
                  <form
                    key={months}
                    action={(fd) => run(() => pauseService(fd))}
                  >
                    <input type="hidden" name="months" value={months} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="btn-secondary min-h-0 px-4 py-2 text-sm"
                    >
                      {t.pauseAction.replace('{n}', String(months))}
                    </button>
                  </form>
                ))}
              </div>
            )
          )}
        </div>

        {/* ── LEAVING ───────────────────────────────────────────────────── */}
        <div>
          <h3 className="font-medium text-ink">{t.cancelTitle}</h3>

          {leaving ? (
            <div className="mt-1">
              <p className="text-base font-medium text-ink">
                {t.cancelled.replace('{date}', day(cancelEffectiveAt))}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(keepService)}
                  className="btn-secondary mt-2 min-h-0 px-4 py-2 text-sm"
                >
                  {t.keep}
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mt-1 max-w-prose text-base text-ink-soft">{t.cancelHelpNoDate}</p>
              {!readOnly && (
                <form
                  className="mt-3"
                  action={(fd) => {
                    // Asked here rather than in a dialog the browser draws:
                    // ending the service is the one thing on this screen
                    // that a mis-click should not be able to do quietly.
                    if (!confirm(t.cancelConfirm)) return
                    run(() => cancelService(fd))
                  }}
                >
                  <label htmlFor="cancel-reason" className="field-label">
                    {t.reasonLabel}
                  </label>
                  <textarea
                    id="cancel-reason"
                    name="reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder}
                    className="input w-full"
                  />
                  <p className="mt-1 text-sm text-ink-mute">{t.reasonHelp}</p>
                  <button
                    type="submit"
                    disabled={pending}
                    className="btn-ghost mt-2 min-h-0 px-4 py-2 text-sm text-danger"
                  >
                    {t.cancelAction}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── BEING FORGOTTEN ───────────────────────────────────────────────── */}
      <div className="mt-6 border-t border-line pt-6">
        <h3 className="font-medium text-ink">{t.eraseTitle}</h3>
        <p className="mt-1 max-w-prose text-base text-ink-soft">
          {t.eraseHelp.replace('{days}', String(ERASURE_GRACE_DAYS))}
        </p>

        {erasing ? (
          <div className="mt-3">
            <p className="text-base font-medium text-danger">
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
          </div>
        ) : (
          !readOnly && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(t.eraseConfirm.replace('{days}', String(ERASURE_GRACE_DAYS)))) return
                run(requestErasure)
              }}
              className="btn-ghost mt-3 min-h-0 px-4 py-2 text-sm text-danger"
            >
              {t.eraseAction}
            </button>
          )
        )}
      </div>

      {failed && (
        <p role="alert" className="mt-4 text-base font-medium text-danger">
          {t.failed}
        </p>
      )}
    </section>
  )
}
