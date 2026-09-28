'use client'

import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import type { Appointment, Patient, PatientRecall, RecallState } from '@/lib/types'
import { formatDay, formatDate, formatWeekdayDate, formatTime } from '@/lib/format'
import { serviceLabel } from '@/lib/onboarding/catalog'
import { recallMessage, segmentsFor, BODY_LIMIT } from '@/lib/recall-copy'
import { fill } from '@/lib/fill'
import { Badge, SectionTitle, APPOINTMENT_TONE } from '@/components/ui'
import {
  savePatientNotes,
  setReminders,
  setMarketing,
  createRecall,
  cancelRecall,
  retryRecall,
} from '@/lib/actions/patients'

/**
 * The record: who they are, what they have agreed to, what is waiting, what
 * happened.
 *
 * ── THE ORDER IS THE ARGUMENT ───────────────────────────────────────────────
 * Notes, then messages, then reminders, then history. Somebody opens this with a
 * telephone in their hand, so what they can read out or write down comes first;
 * the consent comes before the reminders because it is the thing that decides
 * whether a reminder is legal to send, and putting it after would be a form that
 * lets you schedule first and ask permission later.
 *
 * ── THE PREVIEW IS NOT A NICETY ─────────────────────────────────────────────
 * Every claim made about these messages — that the treatment is never named, that
 * the clinic signs them, that there is always a way to stop — is a claim about a
 * string assembled in code the clinic cannot read. So the string is on the
 * screen, before anything is scheduled, exactly as it will be sent.
 */

interface ClinicBits {
  name: string
  language: string
  assigned_phone: string | null
  recalls_enabled: boolean
}

const STATE_TONE = {
  agendado: 'pending',
  enviado: 'ok',
  falhou: 'danger',
  cancelado: 'neutral',
} as const

export function PatientRecord({
  patient,
  appointments,
  recalls,
  clinic,
  dict,
  locale,
  readOnly = false,
}: {
  patient: Patient
  appointments: Appointment[]
  recalls: PatientRecall[]
  clinic: ClinicBits
  dict: Dictionary
  locale: Locale
  readOnly?: boolean
}) {
  const t = dict.pacientes
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error && e.message === 'source_required'
          ? t.marketingSourceRequired
          : dict.common.errorGeneric)
      }
    })
  }

  const visits = appointments.length

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-3xl font-semibold text-ink">{patient.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3">
          <a
            href={`tel:${patient.phone}`}
            className="text-lg text-ink-soft underline decoration-line-strong underline-offset-4"
          >
            {patient.phone}
          </a>
          <span className="text-base text-ink-mute">
            {visits === 1 ? t.visitsOne : fill(t.visits, { n: visits })}
          </span>
          {patient.reminders_opt_out_at && <Badge tone="neutral">{t.optedOut}</Badge>}
        </p>
      </header>

      {error && (
        <p role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      )}

      <Notes patient={patient} t={t} dict={dict} run={run} pending={pending} readOnly={readOnly} />

      <Consent patient={patient} t={t} locale={locale} run={run} pending={pending} readOnly={readOnly} />

      <Reminders
        patient={patient}
        recalls={recalls}
        clinic={clinic}
        t={t}
        dict={dict}
        locale={locale}
        run={run}
        pending={pending}
        readOnly={readOnly}
      />

      <section>
        <SectionTitle>{t.history}</SectionTitle>
        {appointments.length === 0 ? (
          <p className="text-base text-ink-mute">{t.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {appointments.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="block text-base text-ink">
                    {formatWeekdayDate(a.scheduled_at, locale)}, {formatTime(a.scheduled_at, locale)}
                  </span>
                  {/* The reason while it is still there, the service after the
                      reason has been cleared at ninety days, and nothing when
                      both have gone. */}
                  {(a.reason || a.service_id) && (
                    <span className="block text-sm text-ink-soft">
                      {a.reason ?? serviceLabel(a.service_id as string, locale)}
                    </span>
                  )}
                </span>
                <Badge tone={APPOINTMENT_TONE[a.status]}>{dict.status.appointment[a.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type Copy = Dictionary['pacientes']
type Run = (fn: () => Promise<void>) => void

function Notes({
  patient,
  t,
  dict,
  run,
  pending,
  readOnly,
}: {
  patient: Patient
  t: Copy
  dict: Dictionary
  run: Run
  pending: boolean
  readOnly: boolean
}) {
  const [value, setValue] = useState(patient.notes ?? '')
  const dirty = value !== (patient.notes ?? '')
  return (
    <section>
      <SectionTitle>{t.notes}</SectionTitle>
      <p className="mb-3 text-sm text-ink-mute">{t.notesHint}</p>
      <textarea
        rows={4}
        value={value}
        disabled={readOnly}
        onChange={(e) => setValue(e.target.value)}
        className="field-input py-2.5"
        aria-label={t.notes}
      />
      {!readOnly && dirty && (
        <button
          className="btn-primary mt-3"
          disabled={pending}
          onClick={() => run(() => savePatientNotes(patient.id, value))}
        >
          {dict.common.save}
        </button>
      )}
    </section>
  )
}

/**
 * The two permissions, and they are two because the law says so.
 *
 * A reminder about care somebody already had sits inside the relationship they
 * started, with a right to stop it: on by default, off the moment they ask. A
 * commercial message needs a yes given first — LSSI article 21 in Spain, DL
 * 7/2004 article 22 in Portugal — so it is off until somebody records one, and
 * recording one means saying where it was given.
 */
function Consent({
  patient,
  t,
  locale,
  run,
  pending,
  readOnly,
}: {
  patient: Patient
  t: Copy
  locale: Locale
  run: Run
  pending: boolean
  readOnly: boolean
}) {
  const consented = Boolean(patient.marketing_consent_at)
  const [source, setSource] = useState(patient.marketing_consent_source ?? '')

  return (
    <section>
      <SectionTitle>{t.messages}</SectionTitle>
      <div className="flex flex-col gap-3">
        <label className="card flex cursor-pointer items-start gap-3 p-4">
          <input
            type="checkbox"
            checked={!patient.reminders_opt_out_at}
            disabled={readOnly || pending}
            onChange={(e) => run(() => setReminders(patient.id, e.target.checked))}
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span>
            <span className="block text-base text-ink">{t.reminders}</span>
            <span className="mt-1 block text-sm text-ink-mute">{t.remindersHint}</span>
          </span>
        </label>

        <div className="card p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={consented}
              disabled={readOnly || pending}
              onChange={(e) => run(() => setMarketing(patient.id, e.target.checked, source))}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            />
            <span>
              <span className="block text-base text-ink">{t.marketing}</span>
              <span className="mt-1 block text-sm text-ink-mute">{t.marketingHint}</span>
            </span>
          </label>
          {/* Asked before the switch can be flipped, not after: a date with
              nothing beside it is not proof of anything, months later, to
              somebody who does not accept "the box was ticked". */}
          <div className="mt-3 pl-8">
            <label className="field-label" htmlFor="consent-source">
              {t.marketingSource}
            </label>
            <input
              id="consent-source"
              value={source}
              disabled={readOnly || consented}
              placeholder={t.marketingSourcePlaceholder}
              onChange={(e) => setSource(e.target.value)}
              className="field-input max-w-sm"
            />
            {consented && patient.marketing_consent_at && (
              <p className="mt-1 text-sm text-ink-mute">
                {formatDate(patient.marketing_consent_at, locale)}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Reminders({
  patient,
  recalls,
  clinic,
  t,
  dict,
  locale,
  run,
  pending,
  readOnly,
}: {
  patient: Patient
  recalls: PatientRecall[]
  clinic: ClinicBits
  t: Copy
  dict: Dictionary
  locale: Locale
  run: Run
  pending: boolean
  readOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [kind, setKind] = useState<'aviso' | 'campanha'>('aviso')
  const [note, setNote] = useState('')
  const [body, setBody] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const preview = recallMessage(clinic, kind, body)
  const why = (code: string | null) =>
    code === 'baixa'
      ? t.whyBaixa
      : code === 'sem_consentimento'
        ? t.whySemConsentimento
        : code === 'sem_numero'
          ? t.whySemNumero
          : code

  return (
    <section>
      <SectionTitle>{t.recalls}</SectionTitle>

      {recalls.length === 0 ? (
        <p className="text-base text-ink-mute">{t.recallsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recalls.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block text-base text-ink">
                  {r.state === 'enviado' && r.sent_at
                    ? fill(t.sentOn, { when: formatDate(r.sent_at, locale) })
                    : fill(t.dueOn, { when: formatDay(r.due_on, locale) })}
                </span>
                {/* What it is for, and why it never went if it never went.
                    The service as the clinic named it, or whatever somebody
                    wrote when they set it by hand: neither reaches the SMS. */}
                <span className="block text-sm text-ink-soft">
                  {[r.service_id ? serviceLabel(r.service_id, locale) : r.note, why(r.error ?? null)]
                    .filter(Boolean)
                    .join(' \u00b7 ')}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={STATE_TONE[r.state]}>{stateLabel(t, r.state)}</Badge>
                {!readOnly && r.state === 'agendado' && (
                  <button className="btn-ghost" disabled={pending} onClick={() => run(() => cancelRecall(r.id, patient.id))}>
                    {t.cancelRecall}
                  </button>
                )}
                {!readOnly && r.state === 'falhou' && (
                  <button className="btn-ghost" disabled={pending} onClick={() => run(() => retryRecall(r.id, patient.id))}>
                    {t.retryRecall}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && clinic.recalls_enabled && !open && (
        <button className="btn-secondary mt-4" onClick={() => setOpen(true)}>
          {t.add}
        </button>
      )}

      {!readOnly && open && (
        <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="field-label" htmlFor="recall-when">
                {t.addWhen}
              </label>
              <input
                id="recall-when"
                type="date"
                min={today}
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="recall-kind">
                {t.addKind}
              </label>
              <select
                id="recall-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'aviso' | 'campanha')}
                className="field-input"
              >
                <option value="aviso">{t.addKindAviso}</option>
                <option value="campanha">{t.addKindCampanha}</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="field-label" htmlFor="recall-note">
              {t.addNote}
            </label>
            <input
              id="recall-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field-input"
            />
            <p className="mt-1 text-sm text-ink-mute">{t.addNoteHint}</p>
          </div>

          {kind === 'campanha' && (
            <div className="mt-3">
              <label className="field-label" htmlFor="recall-body">
                {t.addBody}
              </label>
              <textarea
                id="recall-body"
                rows={2}
                maxLength={BODY_LIMIT}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="field-input py-2"
              />
              <p className="mt-1 text-sm text-ink-mute">{t.addBodyHint}</p>
            </div>
          )}

          <div className="mt-4 rounded-xl bg-surface px-4 py-3">
            <span className="label-caps mb-1 block">{t.preview}</span>
            <p className="text-base text-ink">{preview}</p>
            <p className="mt-1 text-sm text-ink-mute">
              {fill(t.previewSegments, { n: segmentsFor(preview) })}
            </p>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="btn-primary"
              disabled={pending || !when || (kind === 'campanha' && !body.trim())}
              onClick={() =>
                run(async () => {
                  await createRecall(patient.id, when, kind, note, body)
                  setOpen(false)
                  setWhen('')
                  setNote('')
                  setBody('')
                })
              }
            >
              {dict.common.save}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              {dict.common.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function stateLabel(t: Copy, state: RecallState): string {
  if (state === 'agendado') return t.stateAgendado
  if (state === 'enviado') return t.stateEnviado
  if (state === 'falhou') return t.stateFalhou
  return t.stateCancelado
}
