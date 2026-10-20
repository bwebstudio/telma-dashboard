'use client'

import Link from 'next/link'
import { useState }  from 'react'
import type { Dictionary, Locale } from '@/content'
import type { Appointment, Call, PatientNote } from '@/lib/types'
import { formatDateTime, formatWeekdayDate, formatTime } from '@/lib/format'
import { Badge, SectionTitle } from '@/components/ui'

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
export interface ActivityItem {
  id: string
  at: string
  kind: 'nota' | 'contacto' | 'abertura' | 'fecho' | 'chamada' | 'marcacao'
  reached?: boolean | null
  body?: string | null
  href?: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'pending'
  tag?: string
}

export function PatientActivity({
  notes,
  calls,
  appointments,
  dict,
  locale,
}: {
  notes: PatientNote[]
  calls: Call[]
  appointments: Appointment[]
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes

  const items: ActivityItem[] = [
    ...notes.map((n) => ({
      id: `n-${n.id}`,
      at: n.created_at,
      kind: n.kind,
      reached: n.reached,
      body: n.body === '—' ? null : n.body,
      tag:
        n.kind === 'contacto'
          ? n.reached
            ? t.attemptReachedTag
            : t.attemptMissedTag
          : n.kind === 'abertura'
            ? t.activityOpened
            : n.kind === 'fecho'
              ? t.activityClosed
              : t.activityNote,
      tone: (n.kind === 'contacto'
        ? n.reached
          ? 'ok'
          : 'warn'
        : n.kind === 'abertura'
          ? 'warn'
          : n.kind === 'fecho'
            ? 'ok'
            : 'neutral') as ActivityItem['tone'],
    })),
    ...calls.map((c) => ({
      id: `c-${c.id}`,
      at: c.created_at,
      kind: 'chamada' as const,
      body: c.summary,
      href: `/conversas?c=${c.id}`,
      tag: t.activityCall,
      tone: 'neutral' as const,
    })),
    ...appointments.map((a) => ({
      id: `a-${a.id}`,
      at: a.created_at,
      kind: 'marcacao' as const,
      // The hour agreed, which is the fact worth reading here. What became of
      // it is the badge.
      body: `${formatWeekdayDate(a.scheduled_at, locale)}, ${formatTime(a.scheduled_at, locale)}`,
      tag: dict.status.appointment[a.status],
      tone: 'neutral' as const,
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
            <span
              aria-hidden
              className={`absolute -left-[1.3rem] top-[1.1rem] h-2 w-2 rounded-full ${
                item.tone === 'ok'
                  ? 'bg-ok'
                  : item.tone === 'warn'
                    ? 'bg-warn'
                    : 'bg-line-strong'
              }`}
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time dateTime={item.at} className="text-sm tabular-nums text-ink-mute">
                {formatDateTime(item.at, locale)}
              </time>
              {item.tag && <Badge tone={item.tone ?? 'neutral'}>{item.tag}</Badge>}
              {item.href && (
                <Link
                  href={item.href}
                  className="text-sm text-brand-accent hover:text-brand-hover"
                >
                  {dict.agenda.openConversation}
                </Link>
              )}
            </div>
            {/* A dash is what an entry with nothing to say carries, so that
                the row passes the table's own check. It is not something to
                print under the date. */}
            {item.body && item.body !== '—' && (
              <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-ink">
                {item.body}
              </p>
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
