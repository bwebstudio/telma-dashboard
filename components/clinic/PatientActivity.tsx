'use client'

import Link from 'next/link'
import { useState }  from 'react'
import type { Dictionary, Locale } from '@/content'
import type { Appointment, Call, PatientNote } from '@/lib/types'
import { formatDateTime, formatWeekdayDate, formatTime } from '@/lib/format'
import { SectionTitle, APPOINTMENT_TONE } from '@/components/ui'
import { IconCheck } from '@/components/icons'
import { CallHandled } from '@/components/clinic/CallWork'

/**
 * One story instead of four boxes.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The record held the follow-up in one section, the notes in another, the
 * calls in a third and the bookings in a fourth, each ordered by itself.
 * Somebody at the desk opening it tomorrow does not want four lists, they
 * want one answer to "what has been going on with this person", and that
 * answer is chronological. Reading it off four lists means holding four
 * timelines in your head and interleaving them, which nobody does while a
 * patient is on the telephone.
 *
 * ── WHAT IS IN IT AND WHAT IS NOT ─────────────────────────────────────────
 * Everything that happened: what the clinic did (attempts, notes, opening and
 * closing a follow-up), what the patient did (rang), and what was agreed (a
 * booking, and what became of it). The detailed sections stay underneath,
 * because a call has a summary worth opening and a booking has an hour worth
 * reading; this says that they happened and when.
 *
 * ── AND WHY NOBODY IS NAMED ───────────────────────────────────────────────
 * "Ana opened the follow-up" would be better and would be a lie: a clinic has
 * one login, so the panel knows the clinic did it and not who. Saying a name
 * would mean inventing one. When accounts per person exist, the name goes
 * here and nothing else changes.
 */
/**
 * ── WHAT HAPPENED, THEN THE PARTICULARS, THEN WHEN ────────────────────────
 * An entry used to lead with its timestamp and carry what it was in a badge
 * beside it, so the eye met "04/08/2026, 17:12" before it met "Rejeitada",
 * and the thing refused was nowhere: a booking said only the hour it had been
 * for. Read down a column of them, the dates were the only thing the entries
 * had in common and the only thing they did not need repeating.
 *
 * So each entry says what it is, then what it was about, then when. The date
 * is still there, last and quiet, because "which Tuesday" is a question
 * somebody asks of one entry and never of all of them.
 */
export interface ActivityItem {
  id: string
  at: string
  kind: 'nota' | 'contacto' | 'abertura' | 'fecho' | 'chamada' | 'marcacao'
  /** What happened, in a few words: "Marcação rejeitada", "Não atendeu". */
  title: string
  /** The particulars: the note itself, the service and the hour, a summary. */
  detail?: string | null
  href?: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'pending'
  /** Set on a call, which is the one kind of entry that is also a thing to
   *  do. The day's list asks the same question of the same column; see
   *  CallHandled. */
  callId?: string
}

export function PatientActivity({
  notes,
  calls,
  appointments,
  readOnly,
  dict,
  locale,
}: {
  notes: PatientNote[]
  calls: Call[]
  appointments: Appointment[]
  /** An administrator looking at somebody else's clinic reads and does not
   *  act, the same rule as everywhere else in the panel. */
  readOnly: boolean
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes

  // ── THE SAME STATE THE DAY'S LIST HOLDS, HELD THE SAME WAY ──────────────
  // One press can quieten several entries, because marking a call dealt with
  // closes everything that number had left open before it. They are all on
  // this page, so they all have to move at once. Seeded from the server and
  // corrected by it on the next load. See MessagesDay, which does this for
  // the same reason.
  const [handled, setHandled] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(calls.map((c) => [c.id, c.handled_at ?? null]))
  )
  const doneAt = (callId: string) =>
    callId in handled
      ? handled[callId]
      : (calls.find((c) => c.id === callId)?.handled_at ?? null)
  const markHandled = (at: string | null, ids: string[]) =>
    setHandled((h) => {
      const next = { ...h }
      for (const id of ids) if (calls.some((c) => c.id === id)) next[id] = at
      return next
    })

  const items: ActivityItem[] = [
    ...notes.map((n) => ({
      id: `n-${n.id}`,
      at: n.created_at,
      kind: n.kind,
      // '—' is what an entry with nothing to say carries, so that the row
      // passes the table's own check. It is not something to print.
      detail: n.body === '—' ? null : n.body,
      title:
        n.kind === 'contacto'
          ? // Three outcomes, not two. True and false are what somebody at
            // the desk chose; null is the one press on the day's list, which
            // says the clinic rang back and claims nothing about whether
            // anybody picked up. Reading null as "did not answer" would put
            // words in their mouth. See logCallback.
            n.reached === null
            ? t.attemptRangBack
            : n.reached
              ? t.attemptReachedTag
              : t.attemptMissedTag
          : n.kind === 'abertura'
            ? t.activityOpened
            : n.kind === 'fecho'
              ? t.activityClosed
              : t.activityNote,
      tone: (n.kind === 'contacto'
        ? n.reached === null
          ? 'neutral'
          : n.reached
            ? 'ok'
            : 'warn'
        : n.kind === 'abertura'
          ? 'warn'
          : n.kind === 'fecho'
            ? 'ok'
            : 'neutral') as ActivityItem['tone'],
    })),
    ...calls.map((c) => {
      // A call nobody answered says so on the line, because on a record it is
      // the one entry that is also a thing to do.
      const missed = c.result === 'nao_atendida'
      return {
        id: `c-${c.id}`,
        at: c.created_at,
        kind: 'chamada' as const,
        title: missed ? dict.status.call.nao_atendida : t.activityCall,
        detail: c.summary,
        // Nothing was said, so there is no conversation to open.
        href: missed ? undefined : `/conversas?c=${c.id}`,
        tone: (missed ? 'warn' : 'neutral') as ActivityItem['tone'],
        callId: c.id,
      }
    }),
    ...appointments.map((a) => ({
      id: `a-${a.id}`,
      at: a.created_at,
      kind: 'marcacao' as const,
      // "Marcação rejeitada", not "Rejeitada" under a date: what was refused
      // has to be in the line, and so does what it was for. The reason is the
      // treatment the person asked for, and it goes first because that is how
      // anybody at the desk remembers a booking: the implant on the 7th.
      title: `${t.activityBooking} ${dict.status.appointment[a.status].toLocaleLowerCase(locale)}`,
      detail: [
        a.reason,
        `${formatWeekdayDate(a.scheduled_at, locale)}, ${formatTime(a.scheduled_at, locale)}`,
      ]
        .filter(Boolean)
        .join(' \u00b7 '),
      tone: APPOINTMENT_TONE[a.status] as ActivityItem['tone'],
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at))

  // ── A RECORD GETS LONG, AND THE RECENT PART IS THE PART BEING READ ──────
  // Every call, every attempt, every booking and every opening and closing
  // lands here, so a patient of two years is a page nobody scrolls. The
  // three newest are what somebody with the person on the telephone needs,
  // and the rest is one press away rather than gone: the whole point of
  // writing the closings down is being able to go back and read them.
  const FOLD_AT = 3
  const [expanded, setExpanded] = useState(false)
  const hidden = Math.max(0, items.length - FOLD_AT)
  const shown = expanded ? items : items.slice(0, FOLD_AT)

  if (!items.length) {
    return (
      <section>
        <SectionTitle>{t.activityTitle}</SectionTitle>
        <p className="text-base text-ink-mute">{t.activityEmpty}</p>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle>{t.activityTitle}</SectionTitle>
      {/* A rule down the left, which is what makes a list of dates read as one
          thread rather than as a stack of cards. */}
      <ol className="flex flex-col border-l border-line pl-4">
        {shown.map((item) => (
          <li key={item.id} className="relative py-3 last:pb-0">
            {/* The dot carries the colour, so the line itself can be read as
                a sentence instead of as a label. */}
            <span
              aria-hidden
              className={`absolute -left-[1.3rem] top-[1.05rem] h-2 w-2 rounded-full ${
                item.tone === 'ok'
                  ? 'bg-ok'
                  : item.tone === 'warn' || item.tone === 'pending'
                    ? 'bg-warn'
                    : item.tone === 'danger'
                      ? 'bg-danger'
                      : 'bg-line-strong'
              }`}
            />
            <p className="font-medium text-ink">{item.title}</p>
            {item.detail && (
              <p className="mt-0.5 whitespace-pre-wrap text-base leading-relaxed text-ink-soft">
                {item.detail}
              </p>
            )}
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-sm text-ink-mute">
              <time dateTime={item.at} className="tabular-nums">
                {formatDateTime(item.at, locale)}
              </time>
              {item.href && (
                <Link href={item.href} className="text-brand-accent hover:text-brand-hover">
                  {dict.agenda.openConversation}
                </Link>
              )}
            </p>
            {/* ── AND WHETHER ANYBODY HAS DEALT WITH IT ──────────────────
                Only on a call, because a call is the one entry here that is
                also a thing to do. It is the same column the day's list
                writes, so a message ticked off this morning is already
                ticked off here, and ticking it off here takes it off the
                day's list. Nothing is kept in step because there is only
                one of it. */}
            {item.callId && (
              <div className="mt-1.5">
                {readOnly ? (
                  doneAt(item.callId) && (
                    <span className="badge gap-1.5 bg-ok-soft text-ok">
                      <IconCheck className="h-4 w-4" />
                      {t.callDoneAt.replace('{time}', formatTime(doneAt(item.callId)!, locale))}
                    </span>
                  )
                ) : (
                  <CallHandled
                    callId={item.callId}
                    handledAt={doneAt(item.callId)}
                    onHandled={markHandled}
                    dict={dict}
                    locale={locale}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          className="btn-ghost mt-3 min-h-0 px-4 py-2 text-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t.activityLess : t.activityMore.replace('{n}', String(hidden))}
        </button>
      )}
    </section>
  )
}
