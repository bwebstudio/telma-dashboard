'use client'

import { useState, useTransition } from 'react'
import { PatientActivity } from '@/components/clinic/PatientActivity'
import type { Dictionary, Locale } from '@/content'
import Link from 'next/link'
import type { Appointment, Call, Patient, PatientNote, PatientRecall, RecallState } from '@/lib/types'
import { formatDay, formatDate, formatDateTime, formatDuration, formatWeekdayDate, formatTime } from '@/lib/format'
import { recallMessage, defaultBody, segmentsFor, BODY_LIMIT } from '@/lib/recall-copy'
import { fill } from '@/lib/fill'
import { Badge, SectionTitle, APPOINTMENT_TONE, CALL_TONE } from '@/components/ui'
import {
  addPatientNote,
  deletePatientNote,
  logContactAttempt,
  setFollowUp,
  savePatientTaxId,
  mergePatients,
  setReminders,
  setMarketing,
  createRecall,
  cancelRecall,
  retryRecall,
  deletePatient,
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
  calls,
  notes,
  twins,
  clinic,
  dict,
  locale,
  readOnly = false,
}: {
  patient: Patient
  appointments: Appointment[]
  recalls: PatientRecall[]
  notes: PatientNote[]
  /** Matched by telephone number, so they fall off as the numbers are cleared
   *  at ninety days. See the note on the page that fetches them. */
  calls: Call[]
  /** Other records in this clinic that look like the same person: same name, or
   *  same tax number. Candidates only — a person decides. */
  twins: Patient[]
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
    <div className="flex flex-col gap-14">
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
          {/* Since when this clinic has known them. The one fact about a person
              that a receptionist uses before they have read anything else. */}
          <span className="text-base text-ink-mute">
            {fill(t.since, { when: formatDate(patient.created_at, locale) })}
          </span>
          {patient.reminders_opt_out_at && <Badge tone="neutral">{t.optedOut}</Badge>}
        </p>
      </header>

      {error && (
        <p role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      )}

      {/* ── TWO RECORDS THAT MAY BE ONE PERSON ──────────────────────────────
          Above everything, because somebody who opens a record and works on it
          for a minute before noticing there is a second one has done the minute
          twice. Never merged automatically: a matching name is weak evidence,
          the tax number is the clinic's own, and the merge cannot be undone. */}
      {!readOnly && twins.length > 0 && (
        <section className="rounded-card border border-warn/40 bg-warn-soft/40 p-4">
          <p className="text-base font-medium text-warn">{t.maybeSame}</p>
          <p className="mt-1 text-sm text-ink-soft">{t.maybeSameHint}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {twins.map((other) => (
              <li
                key={other.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3"
              >
                <span className="min-w-0">
                  <Link
                    href={`/pacientes/${other.id}`}
                    className="text-base font-medium text-ink underline decoration-line-strong underline-offset-4"
                  >
                    {other.name}
                  </Link>
                  <span className="ml-2 text-base text-ink-soft">{other.phone}</span>
                  {other.tax_id && (
                    <span className="ml-2 text-sm text-ink-mute">{other.tax_id}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-ink-mute">{t.mergeWarn}</span>
                  <button
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => mergePatients(patient.id, other.id))}
                  >
                    {t.merge}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── THREE GROUPS, SAID WITH SPACE AND NOT WITH HEADINGS ──────────
          Seven sections in one column, evenly spaced, are seven things of
          equal weight, and somebody opening a record for the first time has
          to work out what any of them has to do with the others. They fall
          into three:

            what is being worked on     the follow-up, what is due, the story
            what was said               the messages this person gets, calls
            what is on file             the bookings, the tax number

          The grouping is the spacing. Headings over the top would be three
          more words to read on a screen that already has enough. */}
      <div className="flex flex-col gap-8">
        <Notes
          patient={patient}
          notes={notes}
          t={t}
          dict={dict}
          locale={locale}
          run={run}
          pending={pending}
          readOnly={readOnly}
        />

        {/* ── WHAT IS DUE, BESIDE WHAT IS PENDING ────────────────────────
            It used to be four sections further down, under the messages. A
            reminder to ring somebody tomorrow is the follow-up with a date
            on it, and reading it four screens away from "nothing pending
            with this person" is how both get forgotten. When there is
            nothing scheduled it is one quiet line and a button. */}
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

        {/* ── THE STORY, BEFORE THE DRAWERS ────────────────────────────────
            What has been going on with this person, in order, above everything
            that is a setting or a form. The detailed lists stay below: a call
            has a summary worth opening and a booking has an hour worth reading,
            and this says that they happened and when. */}
        <PatientActivity
          notes={notes}
          calls={calls}
          appointments={appointments}
          dict={dict}
          locale={locale}
        />
      </div>

      <div className="flex flex-col gap-8">
        <Consent patient={patient} t={t} locale={locale} run={run} pending={pending} readOnly={readOnly} />

        <section>
          <SectionTitle>{t.calls}</SectionTitle>
          {calls.length === 0 ? (
            <p className="text-base text-ink-mute">{t.callsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calls.map((c) => (
                <li key={c.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="block text-base text-ink">
                        {formatDateTime(c.created_at, locale)}
                      </span>
                      <span className="block text-sm text-ink-mute">
                        {dict.status.channel[c.channel]}
                        {c.duration_seconds > 0 &&
                          ` \u00b7 ${formatDuration(c.duration_seconds, locale)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {c.result && (
                        <Badge tone={CALL_TONE[c.result]}>{dict.status.call[c.result]}</Badge>
                      )}
                      <Link
                        href={`/conversas?c=${c.id}`}
                        className="text-sm text-brand-accent hover:text-brand-hover"
                      >
                        {dict.agenda.openConversation}
                      </Link>
                    </span>
                  </div>
                  {/* Cleared at ninety days with the number, so an old call is a
                      date and a duration and nothing else. */}
                  {c.summary && (
                    <p className="mt-2 text-base leading-relaxed text-ink-soft">{c.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Why this list is shorter than the person's history. A record that
              quietly loses its oldest calls is one somebody will accuse of having
              lost them. */}
          <p className="mt-3 text-sm text-ink-mute">{t.callsGone}</p>
        </section>
      </div>

      <div className="flex flex-col gap-8">
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
                    {/* Cleared at ninety days, and then this says nothing, which
                        is what it is meant to say. */}
                    {a.reason && <span className="block text-sm text-ink-soft">{a.reason}</span>}
                  </span>
                  <Badge tone={APPOINTMENT_TONE[a.status]}>{dict.status.appointment[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Administrative, and it was sitting between the follow-up and the
            messages as though it were part of the story. It is not: nobody
            opens a record to read a tax number. */}
        <TaxId patient={patient} t={t} dict={dict} run={run} pending={pending} readOnly={readOnly} />

        {/* ── BORRAR, AL FINAL Y SIN ADORNO ────────────────────────────────────
            Abajo del todo porque nadie viene a esta pantalla a borrar, y sin
            tarjeta ni color de alerta porque un botón que grita se acaba pulsando
            por costumbre. Lo que hace falta no es un susto, es saber qué se va y
            qué se queda, y que esto no es el derecho al olvido. */}
        {!readOnly && <DeleteRecord patient={patient} t={t} dict={dict} />}
      </div>
    </div>
  )
}

/**
 * Borrar una ficha: dos pulsaciones, y entre las dos lo que va a pasar.
 *
 * Sin diálogo modal. Un modal tapa la ficha justo cuando lo que hace falta es
 * mirarla otra vez para comprobar que es la que sobra.
 */
function DeleteRecord({
  patient,
  t,
  dict,
}: {
  patient: Patient
  t: Copy
  dict: Dictionary
}) {
  const [armed, setArmed] = useState(false)
  const [pending, start] = useTransition()

  if (!armed) {
    return (
      <div className="border-t border-line pt-6">
        <button className="btn-ghost text-danger" onClick={() => setArmed(true)}>
          {t.deleteRecord}
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-line pt-6">
      <div className="rounded-card border border-danger-soft bg-danger-soft/40 p-4">
        <p className="text-base text-ink">{t.deleteWhatGoes}</p>
        <p className="mt-2 text-sm text-ink-soft">{t.deleteVsErasure}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn-danger"
            disabled={pending}
            onClick={() => start(() => deletePatient(patient.id).catch(() => setArmed(false)))}
          >
            {t.deleteConfirm}
          </button>
          <button className="btn-ghost" onClick={() => setArmed(false)}>
            {dict.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

type Copy = Dictionary['pacientes']
type Run = (fn: () => Promise<void>) => void

/**
 * Following somebody up: what was done, when, and whether it is finished.
 *
 * ── WHY THIS IS NOT A NOTEPAD ─────────────────────────────────────────────
 * The questions a clinic actually has about a person are "how many times did
 * we ring", "did anybody answer", "is this still open" and "since when". A
 * free text field answers none of them without somebody reading every line,
 * so each entry says which kind it is, an attempt records whether the person
 * was reached, and whether anything is pending lives on the record rather
 * than being inferred from prose.
 *
 * ── THE STATE COMES FIRST, THE HISTORY AFTER ──────────────────────────────
 * The one thing somebody opening this record on a Monday needs is whether
 * they still owe this person something. That is a strip at the top, with the
 * day it has been open since. The log is underneath, newest first, because it
 * is read to answer a question the strip has already asked.
 */
function Notes({
  patient,
  notes,
  t,
  dict,
  locale,
  run,
  pending,
  readOnly,
}: {
  patient: Patient
  notes: PatientNote[]
  t: Copy
  dict: Dictionary
  locale: Locale
  run: Run
  pending: boolean
  readOnly: boolean
}) {
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState('')
  // One form at a time, named by the button that opens it. Nothing is open
  // when the record is opened: a box standing ready is a question nobody
  // asked, and three of them at once is three half written things.
  const [panel, setPanel] = useState<'seguimento' | 'contacto' | 'nota' | null>(null)
  const open = Boolean(patient.follow_up_since)
  const attempts = notes.filter((n) => n.kind === 'contacto').length

  const close = () => {
    setPanel(null)
    setDraft('')
    setReason('')
  }

  // The reason is optional, so Enter on an empty field opens the follow-up
  // just as the button does; there is nothing to validate.
  const openFollowUp = () =>
    run(async () => {
      await setFollowUp(patient.id, true, reason)
      close()
    })

  return (
    <section>
      <SectionTitle>{t.followTitle}</SectionTitle>

      {/* ── IS ANYTHING STILL OPEN ──────────────────────────────────────
          Two states, and they must not look alike. Open is a box that says
          so, with the day and the reason. Nothing pending is one quiet line:
          the answer is "no", and "no" does not need a card. */}
      <div className={open ? 'rounded-card border border-warn/40 bg-warn-soft p-4' : ''}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${open ? 'bg-warn' : 'bg-ok'}`}
          />
          {open
            ? t.followOpen.replace('{date}', formatDate(patient.follow_up_since!, locale))
            : t.followClosed}
        </p>
        {open && patient.follow_up_reason && (
          <p className="mt-1 text-base text-ink-soft">{patient.follow_up_reason}</p>
        )}
        {attempts > 0 && (
          <p className="mt-1 text-sm text-ink-mute">
            {attempts === 1 ? t.followAttemptsOne : fill(t.followAttempts, { n: attempts })}
          </p>
        )}
      </div>

      {/* ── THE THREE THINGS SOMEBODY CAN DO HERE, IN ONE ROW ────────────
          "Abrir seguimento" used to sit alone at the far right of the state
          line, a button attached to nothing with a hand's width of white
          space around it, while the other two sat in a row underneath. They
          are three answers to the same question -- what do I do about this
          person now -- and they read as three only when they are side by
          side:

            open a follow-up      there is something to resolve
            log an attempt        I have tried or spoken to them
            add a note            I want to leave some context

          Whichever is pressed opens its own form underneath, and only one at
          a time: two open boxes is two things half written. */}
      {!readOnly && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {open ? (
              <button
                className="btn-secondary min-h-0 px-4 py-2 text-sm"
                disabled={pending}
                onClick={() => run(() => setFollowUp(patient.id, false))}
              >
                {t.followDone}
              </button>
            ) : (
              <button
                className="btn-secondary min-h-0 px-4 py-2 text-sm"
                disabled={pending}
                onClick={() => setPanel(panel === 'seguimento' ? null : 'seguimento')}
              >
                {t.followOpenAction}
              </button>
            )}
            <button
              className="btn-secondary min-h-0 px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => setPanel(panel === 'contacto' ? null : 'contacto')}
            >
              {t.logAttempt}
            </button>
            <button
              className="btn-ghost min-h-0 px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => setPanel(panel === 'nota' ? null : 'nota')}
            >
              {t.noteAdd}
            </button>
          </div>

          {/* Why, in a field as wide as the card. Nothing is shown here until
              the button above is pressed: an input standing open on a record
              with nothing pending is a question nobody asked. */}
          {panel === 'seguimento' && (
            <div className="mt-3 flex w-full flex-wrap items-center gap-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !pending) openFollowUp()
                  if (e.key === 'Escape') close()
                }}
                placeholder={t.followReasonPlaceholder}
                aria-label={t.followOpenAction}
                className="field-input min-w-0 flex-1 basis-72 py-2"
              />
              <button
                className="btn-primary min-h-0 shrink-0 px-4 py-2 text-sm"
                disabled={pending}
                onClick={() => openFollowUp()}
              >
                {t.followOpenAction}
              </button>
              <button
                className="btn-ghost min-h-0 shrink-0 px-4 py-2 text-sm"
                disabled={pending}
                onClick={close}
              >
                {dict.common.cancel}
              </button>
            </div>
          )}

          {(panel === 'contacto' || panel === 'nota') && (
            <div className="mt-3">
              {/* ── WRITE IT, THEN FILE IT ──────────────────────────────────
                  The buttons used to sit above the box, so that logging a
                  call was one press and the words were optional afterwards.
                  Read on a note, where the words are the whole point, that
                  put Guardar above the thing it saves: people typed, looked
                  down for the button, and found a disclaimer. The box comes
                  first now and the action closes it.

                  The hint still goes on top on an attempt, because what it
                  says is that the text is optional, and that has to be read
                  before the box rather than after it. */}
              {panel === 'contacto' && (
                <p className="mb-2 text-sm text-ink-mute">{t.attemptHint}</p>
              )}
              <textarea
                rows={3}
                autoFocus
                value={draft}
                placeholder={panel === 'contacto' ? t.attemptPlaceholder : t.notePlaceholder}
                onChange={(e) => setDraft(e.target.value)}
                className="field-input py-2.5"
                aria-label={panel === 'contacto' ? t.logAttempt : t.noteAdd}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {panel === 'contacto' ? (
                  <>
                    {/* Two buttons and not a tick: "did they answer" has two
                        real answers and both are worth one press. */}
                    <button
                      className="btn-primary min-h-0 px-4 py-2 text-sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await logContactAttempt(patient.id, true, draft)
                          close()
                        })
                      }
                    >
                      {t.attemptReached}
                    </button>
                    <button
                      className="btn-secondary min-h-0 px-4 py-2 text-sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await logContactAttempt(patient.id, false, draft)
                          close()
                        })
                      }
                    >
                      {t.attemptMissed}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-primary min-h-0 px-4 py-2 text-sm"
                    disabled={pending || !draft.trim()}
                    onClick={() =>
                      run(async () => {
                        await addPatientNote(patient.id, draft)
                        close()
                      })
                    }
                  >
                    {dict.common.save}
                  </button>
                )}
                <button
                  className="btn-ghost min-h-0 px-4 py-2 text-sm"
                  disabled={pending}
                  onClick={close}
                >
                  {dict.common.cancel}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="mt-4 max-w-prose text-sm text-ink-mute">{t.notesHint}</p>
    </section>
  )
}

/**
 * The tax number, and the one line on this screen explaining why Telma does not
 * ask for it: a receptionist types it with the person in front of them. Reading
 * an identifier out to somebody for them to agree with is the thing neither we
 * nor the clinic software we integrate with will do.
 */
function TaxId({
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
  const [value, setValue] = useState(patient.tax_id ?? '')
  const dirty = value.trim() !== (patient.tax_id ?? '')
  return (
    <section>
      <SectionTitle>{t.taxId}</SectionTitle>
      <p className="mb-3 text-sm text-ink-mute">{t.taxIdHint}</p>
      <input
        value={value}
        disabled={readOnly}
        aria-label={t.taxId}
        onChange={(e) => setValue(e.target.value)}
        className="field-input max-w-xs"
      />
      {!readOnly && dirty && (
        <button
          className="btn-primary mt-3 block"
          disabled={pending}
          onClick={() => run(() => savePatientTaxId(patient.id, value))}
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
  const [missing, setMissing] = useState(false)

  // Refused here rather than in the action, so the answer appears under the box
  // it is about. The action still refuses it too: this is the message, that is
  // the rule.
  const turnOn = (wanted: boolean) => {
    if (wanted && !source.trim()) {
      setMissing(true)
      return
    }
    setMissing(false)
    run(() => setMarketing(patient.id, wanted, source))
  }

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
              onChange={(e) => turnOn(e.target.checked)}
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
              aria-invalid={missing || undefined}
              aria-describedby="consent-source-note"
              onChange={(e) => {
                setSource(e.target.value)
                if (e.target.value.trim()) setMissing(false)
              }}
              className={`field-input max-w-sm ${missing ? 'border-danger' : ''}`}
            />
            {/* Said before it is needed, not only after it is refused: a
                checkbox that does nothing and explains itself somewhere else on
                the page is a checkbox that looks broken. */}
            {!consented && (
              <p
                id="consent-source-note"
                className={`mt-1 text-sm ${missing ? 'font-medium text-danger' : 'text-ink-mute'}`}
              >
                {missing ? t.marketingSourceRequired : t.marketingSourceMandatory}
              </p>
            )}
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
  const [body, setBody] = useState(defaultBody(clinic.language, 'aviso'))

  // Switching kind swaps the starting sentence, unless somebody has written
  // their own by then. Overwriting what they typed to be helpful is worse than
  // leaving a sentence that does not fit.
  const switchKind = (next: 'aviso' | 'campanha') => {
    setKind(next)
    const untouched = !body.trim() || body === defaultBody(clinic.language, kind)
    if (untouched) setBody(defaultBody(clinic.language, next))
  }

  // ── WHAT THIS PERSON HAS AGREED TO ─────────────────────────────────────
  // An aviso needs no yes but obeys a no, and a promotion needs a yes. Both
  // rules are checked again on the morning the message is due, which is the
  // only place they can be enforced -- somebody may change their mind between
  // today and then. But a panel that offers to schedule something it already
  // knows will not be sent is a panel that quietly wastes the clinic's time:
  // the row sits there reading "Agendado" for days and then turns into "Não
  // foi enviado". So the offer is withdrawn while the answer is no, and comes
  // back the moment it changes in Mensagens, below.
  const optedOut = Boolean(patient.reminders_opt_out_at)
  const mayPromote = Boolean(patient.marketing_consent_at)
  const waiting = recalls.some((r) => r.state === 'agendado')

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
        // Nothing scheduled is the normal state of this section, and it was
        // taking a heading, a sentence and a button to say so. One line.
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink-mute">
          {t.recallsEmpty}
          {!readOnly && !open && !optedOut && (
            <button
              className="text-base text-brand-accent hover:text-brand-hover"
              onClick={() => setOpen(true)}
            >
              {t.add}
            </button>
          )}
        </p>
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
                {/* Why somebody set it, and why it never went if it never
                    went. Neither reaches the SMS. */}
                <span className="block text-sm text-ink-soft">
                  {[r.note, why(r.error ?? null)].filter(Boolean).join(' \u00b7 ')}
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

      {optedOut && (
        <p className={`mt-3 text-sm ${waiting ? 'text-warn' : 'text-ink-mute'}`}>
          {waiting ? t.addBlockedWaiting : t.addBlocked}
        </p>
      )}

      {!readOnly && !open && !optedOut && recalls.length > 0 && (
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
                onChange={(e) => switchKind(e.target.value as 'aviso' | 'campanha')}
                className="field-input"
              >
                <option value="aviso">{t.addKindAviso}</option>
                <option value="campanha" disabled={!mayPromote}>
                  {t.addKindCampanha}
                </option>
              </select>
              {!mayPromote && (
                <p className="mt-1 max-w-xs text-sm text-ink-mute">{t.addKindNoConsent}</p>
              )}
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

          {/* Editable whichever kind it is. The reminder starts from the
              default sentence rather than being stuck with it: it is the
              clinic's message, to the clinic's patient, and a default nobody
              can change is a guess about somebody else's clinic. What the
              screen does instead is say what not to write, and show the exact
              result below. */}
          <div className="mt-3">
            <label className="field-label" htmlFor="recall-body">
              {t.addBody}
            </label>
            <textarea
              id="recall-body"
              rows={2}
              maxLength={BODY_LIMIT}
              value={body}
              placeholder={defaultBody(clinic.language, kind)}
              onChange={(e) => setBody(e.target.value)}
              className="field-input py-2"
            />
            <p className="mt-1 text-sm text-ink-mute">{t.addBodyHint}</p>
            <p className="mt-1 text-sm text-warn">{t.addBodyWarn}</p>
          </div>

          {/* Lo que cuesta, dicho donde está el botón y en ninguna otra parte.
              Es el momento en que va a gastarse y la única persona a quien le
              importa. */}
          <p className="mt-3 text-sm text-ink-mute">{t.addCosts}</p>

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
                  setBody(defaultBody(clinic.language, 'aviso'))
                  setKind('aviso')
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
