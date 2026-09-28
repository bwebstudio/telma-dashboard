'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import type { RecallState } from '@/lib/types'
import { serviceLabel } from '@/lib/onboarding/catalog'
import { formatDay } from '@/lib/format'
import { Badge, SectionTitle } from '@/components/ui'
import { cancelRecall, retryRecall } from '@/lib/actions/patients'

/**
 * What is going out in the next fortnight, and what did not go out at all.
 *
 * ── THE ONLY REASON THIS EXISTS ─────────────────────────────────────────────
 * A clinic types "6" into a box and a message leaves six months later, by which
 * time nobody remembers typing it. This is the window in between: the mistake is
 * visible for a fortnight before it reaches a patient, and cancelling one is a
 * single click with no confirmation, because there is nothing to undo.
 *
 * Nothing here has to be approved. A queue that needed signing off would be
 * abandoned in the third week and the whole feature with it, which is the thing
 * the clinic asked for in the first place. This is a veto, not a gate.
 *
 * ── THE FAILURES COME FIRST ─────────────────────────────────────────────────
 * Because they are the only rows anybody has to do anything about, and because
 * Twilio's own words are beside them: "not a mobile number" is something a
 * receptionist can fix, and "failed" is not.
 */

export interface QueueItem {
  id: string
  patientId: string
  patientName: string
  dueOn: string
  state: RecallState
  kind: 'aviso' | 'campanha'
  serviceId: string | null
  note: string | null
  error: string | null
}

export function RecallQueue({
  rows,
  dict,
  locale,
  readOnly = false,
}: {
  rows: QueueItem[]
  dict: Dictionary
  locale: Locale
  readOnly?: boolean
}) {
  const t = dict.pacientes
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)

  const run = (fn: () => Promise<void>) => {
    setFailed(false)
    start(async () => {
      try {
        await fn()
      } catch {
        setFailed(true)
      }
    })
  }

  const broken = rows.filter((r) => r.state === 'falhou')
  const waiting = rows.filter((r) => r.state === 'agendado')

  return (
    <section className="mb-10">
      <SectionTitle>{t.queue}</SectionTitle>

      {failed && (
        <p role="alert" className="mb-3 text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}

      {broken.length > 0 && (
        <div className="mb-4 rounded-card border border-danger-soft bg-danger-soft/40 p-4">
          <p className="mb-2 text-base font-medium text-danger">{t.failed}</p>
          <ul className="flex flex-col gap-2">
            {broken.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <Link href={`/pacientes/${r.patientId}`} className="text-base font-medium text-ink underline decoration-line-strong underline-offset-4">
                    {r.patientName}
                  </Link>
                  {/* Twilio's own sentence, not a code and not our paraphrase. */}
                  {r.error && <span className="ml-2 text-sm text-ink-soft">{r.error}</span>}
                </span>
                {!readOnly && (
                  <button
                    className="btn-ghost"
                    disabled={pending}
                    onClick={() => run(() => retryRecall(r.id))}
                  >
                    {t.retryRecall}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {waiting.length === 0 ? (
        <p className="text-base text-ink-mute">{t.queueEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {waiting.map((r) => (
            <li
              key={r.id}
              className="card flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <span className="min-w-0">
                <Link
                  href={`/pacientes/${r.patientId}`}
                  className="text-base font-medium text-ink underline decoration-line-strong underline-offset-4"
                >
                  {r.patientName}
                </Link>
                {/* What it is for, which is on this screen and never in the
                    message. The service as the clinic named it, or whatever
                    somebody wrote when they set it by hand. */}
                <span className="ml-2 text-base text-ink-soft">
                  {r.serviceId ? serviceLabel(r.serviceId, locale) : r.note}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {r.kind === 'campanha' && <Badge tone="info">{t.addKindCampanha}</Badge>}
                <span className="text-sm text-ink-mute">{formatDay(r.dueOn, locale)}</span>
                {!readOnly && (
                  <button
                    className="btn-ghost"
                    disabled={pending}
                    onClick={() => run(() => cancelRecall(r.id))}
                  >
                    {t.cancelRecall}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
