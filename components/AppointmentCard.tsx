'use client'

import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import type { Appointment } from '@/lib/types'
import { formatWeekdayDate, formatTime } from '@/lib/format'
import { Badge } from './ui'
import { IconCopy, IconCheck, IconClose } from './icons'
import {
  confirmAppointment,
  markCopied,
  alterAppointment,
  rejectAppointment,
} from '@/lib/actions/appointments'

const statusTone = {
  pendente: 'pending',
  confirmada: 'ok',
  copiada: 'ok',
  rejeitada: 'danger',
} as const

export function AppointmentCard({
  appt,
  dict,
  locale,
}: {
  appt: Appointment
  dict: Dictionary
  locale: Locale
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'none' | 'reject' | 'alter'>('none')

  const m = dict.marcacoes
  const decided = appt.status !== 'pendente'

  function run(fn: () => Promise<void>) {
    setError(false)
    start(async () => {
      try {
        await fn()
      } catch {
        setError(true)
      }
    })
  }

  async function copyDetails() {
    const lines = [
      `${dict.common.patient}: ${appt.patient_name}`,
      `${dict.common.phone}: ${appt.patient_phone}`,
      appt.reason ? `${dict.common.reason}: ${appt.reason}` : '',
      `${dict.common.date}: ${formatWeekdayDate(appt.scheduled_at, locale)}`,
      `${dict.common.time}: ${formatTime(appt.scheduled_at, locale)}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      if (appt.status === 'confirmada') run(() => markCopied(appt.id))
    } catch {
      setError(true)
    }
  }

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mid text-xl font-semibold text-ink">
            {appt.patient_name}
          </h3>
          <a
            href={`tel:${appt.patient_phone}`}
            className="text-base text-ink-soft underline decoration-line-strong underline-offset-4"
          >
            {appt.patient_phone}
          </a>
        </div>
        <Badge tone={statusTone[appt.status]}>{dict.status.appointment[appt.status]}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row label={dict.common.date} value={formatWeekdayDate(appt.scheduled_at, locale)} />
        <Row label={dict.common.time} value={formatTime(appt.scheduled_at, locale)} />
        {appt.reason && <Row label={dict.common.reason} value={appt.reason} />}
        <Row label="" value={dict.status.origin[appt.origin]} />
      </dl>

      {appt.summary && (
        <p className="mt-4 rounded-xl bg-surface-sunken px-4 py-3 text-base leading-relaxed text-ink-soft">
          <span className="label-caps mb-1 block">{dict.common.summary}</span>
          {appt.summary}
        </p>
      )}

      {/* Copied to system: unmistakable state */}
      {appt.status === 'copiada' && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok">
          <IconCheck className="h-5 w-5" />
          {m.copiedToSystem}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}

      {/* Actions */}
      {mode === 'none' && (
        <div className="mt-5 flex flex-wrap gap-2">
          {appt.status === 'pendente' && (
            <button className="btn-primary" onClick={() => run(() => confirmAppointment(appt.id))} disabled={pending}>
              <IconCheck className="h-5 w-5" />
              {m.confirm}
            </button>
          )}
          {(appt.status === 'confirmada' || appt.status === 'copiada') && (
            <button className="btn-primary" onClick={copyDetails} disabled={pending}>
              {copied ? <IconCheck className="h-5 w-5" /> : <IconCopy className="h-5 w-5" />}
              {copied ? dict.common.copied : m.copyData}
            </button>
          )}
          {appt.status === 'pendente' && (
            <>
              <button className="btn-secondary" onClick={() => setMode('alter')} disabled={pending}>
                {m.alter}
              </button>
              <button className="btn-ghost" onClick={copyDetails} disabled={pending}>
                <IconCopy className="h-5 w-5" />
                {copied ? dict.common.copied : m.copyData}
              </button>
              <button className="btn-danger" onClick={() => setMode('reject')} disabled={pending}>
                {m.reject}
              </button>
            </>
          )}
        </div>
      )}

      {appt.status === 'confirmada' && mode === 'none' && (
        <p className="mt-3 text-sm text-ink-mute">{m.copiedToSystemHint}</p>
      )}

      {/* Alter panel */}
      {mode === 'alter' && (
        <AlterPanel
          dict={dict}
          pending={pending}
          onCancel={() => setMode('none')}
          onSubmit={(iso) => {
            run(() => alterAppointment(appt.id, iso))
            setMode('none')
          }}
        />
      )}

      {/* Reject panel */}
      {mode === 'reject' && (
        <RejectPanel
          dict={dict}
          pending={pending}
          onCancel={() => setMode('none')}
          onSubmit={(reason) => {
            run(() => rejectAppointment(appt.id, reason))
            setMode('none')
          }}
        />
      )}
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-base">
      {label && <dt className="text-ink-mute">{label}:</dt>}
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function AlterPanel({
  dict,
  pending,
  onCancel,
  onSubmit,
}: {
  dict: Dictionary
  pending: boolean
  onCancel: () => void
  onSubmit: (iso: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
      <p className="mb-3 flex items-start gap-2 text-sm text-warn">
        <IconClose className="mt-0.5 h-4 w-4 shrink-0 rotate-45" />
        {dict.marcacoes.alterWarning}
      </p>
      <label className="field-label" htmlFor="alter-dt">
        {dict.marcacoes.newDateTime}
      </label>
      <input
        id="alter-dt"
        type="datetime-local"
        className="field-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary"
          disabled={pending || !value}
          onClick={() => value && onSubmit(new Date(value).toISOString())}
        >
          {dict.common.save}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </div>
    </div>
  )
}

function RejectPanel({
  dict,
  pending,
  onCancel,
  onSubmit,
}: {
  dict: Dictionary
  pending: boolean
  onCancel: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
      <label className="field-label" htmlFor="reject-reason">
        {dict.marcacoes.rejectReason}
      </label>
      <textarea
        id="reject-reason"
        rows={2}
        className="field-input py-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="mt-1 text-sm text-ink-mute">{dict.marcacoes.rejectReasonHint}</p>
      <div className="mt-3 flex gap-2">
        <button className="btn-danger" disabled={pending} onClick={() => onSubmit(reason)}>
          {dict.marcacoes.reject}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          {dict.common.cancel}
        </button>
      </div>
    </div>
  )
}
