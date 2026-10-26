'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Dictionary, Locale } from '@/content'
import type { Call } from '@/lib/types'
import { Badge, CALL_TONE } from '@/components/ui'
import { DaySwitcher } from '@/components/clinic/DaySwitcher'
import { formatDate, formatTime } from '@/lib/format'
import { IconCheck, IconPhone, IconPhoneMissed, IconWhatsApp } from '@/components/icons'
import { FollowCaller } from '@/components/clinic/FollowCaller'
import { CallWork } from '@/components/clinic/CallWork'

/**
 * The day, for a clinic whose Telma does not book.
 *
 * ── WHY THIS SCREEN EXISTS ─────────────────────────────────────────────────
 * Hiding the diary from a clinic that only takes messages was right, and it
 * left them without the one screen everybody opens in the morning: what has
 * been going on. Conversations is a searchable archive with filters, which is
 * what you use when you are looking for something; this is what you use when
 * you are not looking for anything in particular and want to know how the day
 * has gone.
 *
 * So the first entry in the menu keeps its place and changes its meaning. It
 * is not a diary to confirm and cancel in: it is the answer to "what did
 * Telma do today", and under it, "and this week".
 *
 * ── WHY THE MESSAGE IS NOT BEHIND A CLICK ──────────────────────────────────
 * The list in Conversations folds each call away and opens it on demand,
 * which is right for an archive of hundreds. Here the message is the whole
 * point of the row: a clinic reading this wants the fifteen words Telma wrote
 * down, not a list of telephone numbers to open one by one.
 */
/** What has been done about one call, as this screen holds it. */
type Work = {
  handledAt: string | null
  tries: number
  lastTry: string | null
  /** How the last attempt went, where that is known. A caller with no record
   *  keeps the count on the call itself and the call has no column for this,
   *  so there it stays null: "the clinic rang back", which is all the press on
   *  this screen ever claimed. */
  lastReached: boolean | null
  /** When somebody actually answered, if they did. */
  spokeAt: string | null
}

/** What the server last said about it, which is where every row starts. */
const asWritten = (c: Call): Work => ({
  handledAt: c.handled_at ?? null,
  tries: Number(c.callbacks ?? 0),
  lastTry: c.called_back_at ?? null,
  lastReached: null,
  spokeAt: null,
})

export function MessagesDay({
  calls,
  records,
  attempts,
  week,
  dayKey,
  todayKey,
  yesterdayKey,
  heading,
  readOnly,
  dict,
  locale,
}: {
  /** The selected day's calls, newest first. */
  calls: Call[]
  /** The records each caller already has, by the last nine digits they rang
   *  from. Missing means there is none yet, and the row offers to open one.
   *  A list rather than one record because a number is often a household;
   *  the name comes with it, because a number reception recognises is a
   *  person they can greet and nobody can read a number aloud to a patient. */
  records: Record<
    string,
    Array<{ id: string; name: string; nameKey: string; followUpSince: string | null }>
  >
  /** Today's attempts to reach each of those people, newest first, read out
   *  of their own history. The row counts the ones since the call it is on.
   *
   *  `reached` is how the attempt went, and it has three values because the
   *  desk has three answers: true for "falei com a pessoa", false for "não
   *  atendeu", and null for the press on this screen, which says the clinic
   *  rang back and claims nothing about who picked up. */
  attempts: Record<string, Array<{ at: string; reached: boolean | null }>>
  /** One row per day of the last seven, oldest first. */
  week: Array<{ dayKey: string; label: string; answered: number; missed: number }>
  dayKey: string
  todayKey: string
  yesterdayKey: string
  /** The selected day, written out. */
  heading: string
  /** An administrator looking at somebody else's clinic reads and does not
   *  act, the same rule as everywhere else in the panel. */
  readOnly: boolean
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.agenda

  // ── ONE PLACE REMEMBERS WHAT HAS BEEN DONE ───────────────────────────────
  // The heading counts what is left and each row says whether it is one of
  // them, which is the same fact drawn twice. Held here, so pressing
  // "Tratado" moves the row and the figure above it together: a count that
  // lags behind the list it is counting is read as the screen being wrong.
  //
  // Seeded from the server and corrected by it on the next load; this is the
  // same morning's work, not a second source of truth.
  const [work, setWork] = useState<Record<string, Work>>(() =>
    Object.fromEntries(calls.map((c) => [c.id, asWritten(c)]))
  )
  // ── TWO FACTS, AND THEY DO NOT LIVE IN THE SAME PLACE ───────────────────
  // Whether this call is dealt with is a fact about the call, so it is on the
  // call. How many times somebody has been rung back is a fact about the
  // person, so where they have a record it is read out of their history and
  // not out of a counter on a line: three calls from one person this morning
  // are not three separate attempts to reach them.
  //
  // Only the ones since this call, because that is the question the row is
  // asking. A caller with no record has no history and keeps the counter on
  // the call, which is the only place it can be and contradicts nothing.
  const [rung, setRung] = useState<Record<string, Array<{ at: string; reached: boolean | null }>>>(
    attempts
  )
  const stateOf = (c: Call) => {
    const mine = work[c.id] ?? asWritten(c)
    const who = recordOf(c)
    if (!who) return mine
    const since = (rung[who.id] ?? []).filter((a) => a.at >= c.created_at)
    // The newest attempt where somebody answered. It outranks the count and
    // the hour of the last try: once the clinic has spoken to them, three
    // attempts is history and "falámos" is the news.
    const spoke = since.find((a) => a.reached === true) ?? null
    return {
      ...mine,
      tries: since.length,
      lastTry: since[0]?.at ?? null,
      lastReached: since[0]?.reached ?? null,
      spokeAt: spoke?.at ?? null,
    }
  }

  // ── ONE PRESS CAN QUIETEN SEVERAL ROWS ───────────────────────────────────
  // Marking a call dealt with closes everything that number had left open
  // before it, because it was the same thing being asked twice. Most of those
  // calls are on other days and the server has them; the ones that are on
  // this screen have to go quiet now, with the figure above them.
  const markHandled = (at: string | null, ids: string[]) =>
    setWork((w) => {
      const next = { ...w }
      for (const id of ids) {
        const call = calls.find((c) => c.id === id)
        if (!call) continue
        next[id] = { ...(w[id] ?? asWritten(call)), handledAt: at }
      }
      return next
    })

  // ── WHICH RECORD THIS CALL BELONGS TO ────────────────────────────────────
  // One number, one person, almost always, and then the record is simply
  // theirs. But the key has been (clinic, digits, name) since 0049 because a
  // number is often a household: Ana and her husband ring from the same
  // handset and hold two records. With two on the line the number alone does
  // not say who rang, so the name Telma heard on this call decides, by the
  // same prefix rule `remember_patient` uses -- "Ana" and "Ana Martins" on
  // one number are one person.
  //
  // And when even that does not settle it, this stays silent: no name on the
  // row and no record behind it, so the row offers to take the name instead.
  // Writing "João" over Ana's call to fill a gap is the one outcome worth
  // avoiding, and typing the name lands on the right record anyway.
  // ── WHAT TO SAY ABOUT THE ATTEMPTS ──────────────────────────────────────
  // One attempt gets the hour, which is what somebody wants on a morning's
  // work: "rung back at 11:40". But an attempt now comes out of the person's
  // history and that does not end at midnight, so an hour on its own would
  // read as today when it was Tuesday. More than one gets the count, and the
  // record holds the dates.
  const triedLabel = (c: Call) => {
    const { tries, lastTry, lastReached, spokeAt } = stateOf(c)
    if (tries === 0) return null
    const t = dict.pacientes
    // Somebody answered, so that is the whole sentence, whichever attempt it
    // was and however many there were before it.
    if (spokeAt) {
      return formatDate(spokeAt, locale) === formatDate(c.created_at, locale)
        ? t.spokeAt.replace('{time}', formatTime(spokeAt, locale))
        : t.spokeOn.replace('{date}', formatDate(spokeAt, locale))
    }
    // Nobody did, and more than one try is a count rather than an hour: the
    // record holds the dates and this screen holds the morning.
    if (tries > 1 || !lastTry) return t.calledBackTimes.replace('{n}', String(tries))
    const sameDay = formatDate(lastTry, locale) === formatDate(c.created_at, locale)
    if (lastReached === false) {
      return sameDay
        ? t.noAnswerAt.replace('{time}', formatTime(lastTry, locale))
        : t.noAnswerOn.replace('{date}', formatDate(lastTry, locale))
    }
    return sameDay
      ? t.calledBackAt.replace('{time}', formatTime(lastTry, locale))
      : t.calledBackOn.replace('{date}', formatDate(lastTry, locale))
  }

  /** The same three outcomes, as a colour. Reception reads a morning by the
   *  shape of it, and a line that says the matter is closed should not be the
   *  same grey as one that says nobody picked up. The tones are the record's
   *  own, so a person who looks at both screens sees one vocabulary. */
  const triedTone = (c: Call): 'ok' | 'warn' | 'mute' => {
    const { spokeAt, lastReached, tries } = stateOf(c)
    if (spokeAt) return 'ok'
    if (tries === 1 && lastReached === false) return 'warn'
    return 'mute'
  }

  const recordOf = (c: Call) => {
    const people = records[(c.from_phone ?? '').replace(/\D/g, '').slice(-9)] ?? []
    if (people.length <= 1) return people[0] ?? null
    const heard = (c.patient_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!heard) return null
    return (
      people.find((p) => p.nameKey === heard) ??
      people.find((p) => p.nameKey.startsWith(heard) || heard.startsWith(p.nameKey)) ??
      null
    )
  }

  const answered = calls.filter((c) => c.result !== 'nao_atendida').length
  const missed = calls.filter((c) => c.result === 'nao_atendida').length
  const pendingWork = calls.filter((c) => !stateOf(c).handledAt).length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 className="text-xl font-semibold text-ink">{heading}</h2>
        {/* No tomorrow. This screen is about what has already happened, and a
            tab leading to a day that cannot have anything on it is a tab that
            teaches people the screen is broken. */}
        <DaySwitcher
          current={dayKey}
          today={todayKey}
          yesterday={yesterdayKey}
          labels={{ before: t.dayBefore, today: t.dayToday, pick: t.pickDay }}
        />
      </div>

      <p className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-soft">
        <span>
          <span className="font-mid text-ink">{answered}</span> {t.doneCalls.toLocaleLowerCase(locale)}
        </span>
        {missed > 0 && (
          <span className="text-warn">
            <span className="font-mid">{missed}</span> {t.doneMissed.toLocaleLowerCase(locale)}
          </span>
        )}
        {/* The figure the day is read for. Not drawn on a day with nothing
            left: a zero here is the ordinary end of a morning, and a row of
            counters that never changes is a row nobody reads. */}
        {pendingWork > 0 && (
          <span className="font-mid text-ink">
            {dict.pacientes.callsPending.replace('{n}', String(pendingWork))}
          </span>
        )}
      </p>

      {calls.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-base text-ink-mute">
          {t.messagesEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {calls.map((c) => {
            const done = stateOf(c).handledAt
            const known = recordOf(c)
            // The record's name first: it is the clinic's own spelling, kept
            // on purpose. `patient_name` is what Telma heard on the call,
            // which is better than nothing and worse than a record.
            const name = known?.name || c.patient_name
            return (
              // What is dealt with fades. Not a colour on what is pending,
              // which would paint the whole list at nine in the morning: the
              // list empties as the morning is worked through, and what is
              // left is what is left.
              //
              // The green edge is drawn inset rather than as a border, so a
              // card going quiet does not shift its own text sideways by the
              // width of the line. --ok-mark and not --ok: it is the same
              // green as the live dot, which is the one green in the panel
              // that means "now" and "done".
              <li
                key={c.id}
                className={`card p-4 ${done ? 'shadow-[inset_3px_0_0_0_rgb(var(--ok-mark))]' : ''}`}
              >
                {/* Everything that has already been read is dimmed together,
                    and the mark underneath is deliberately outside it. */}
                <div className={done ? 'opacity-55' : ''}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mid text-lg text-ink">
                      {formatTime(c.created_at, locale)}
                    </span>
                    <span
                      className={c.channel === 'whatsapp' ? 'text-ok' : 'text-ink-mute'}
                      aria-label={dict.status.channel[c.channel]}
                    >
                      {c.channel === 'whatsapp' ? (
                        <IconWhatsApp className="h-4 w-4" />
                      ) : (
                        <IconPhone className="h-4 w-4" />
                      )}
                    </span>
                    {/* ── THE NAME AND THE NUMBER, IN THAT ORDER ─────────
                        Whoever is about to ring back needs both and they are
                        not the same kind of thing. The name is who it is, so
                        it carries the weight of the hour beside it; the
                        number is how you reach them, so it stays quiet and
                        next to it, ready to be read out or copied. A caller
                        with no record and no name keeps the number alone,
                        which is all we know about them. */}
                    {name ? (
                      <span className="min-w-0 flex-1 truncate text-base">
                        <span className="font-mid text-ink">{name}</span>
                        {c.from_phone && <span className="text-ink-soft"> · {c.from_phone}</span>}
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-base text-ink-soft">
                        {c.from_phone || dict.common.noNumber}
                      </span>
                    )}
                    {/* Nothing was said on a call nobody answered, so there is
                        nothing to open. The person is still worth following up:
                        they rang and got nobody. */}
                    {c.result !== 'nao_atendida' && (
                      <Link
                        href={`/conversas?c=${c.id}`}
                        className="text-sm text-brand-accent hover:text-brand-hover"
                      >
                        {dict.agenda.openConversation}
                      </Link>
                    )}
                    {/* ── TWO DIFFERENT THINGS, AND ONLY ONE AT A TIME ───────
                        A call somebody spoke on has a person behind it, so the
                        row leads to their record, where every attempt and note
                        belongs. A call nobody answered has no person and no name;
                        opening a record on a bare number would put a row nobody
                        can read into the list that has to outlive this mode. So
                        that one carries the only mark it can: we rang back. */}
                    {c.from_phone && (
                      <FollowCaller
                        phone={c.from_phone}
                        patientId={known?.id ?? null}
                        heardName={c.patient_name}
                        dict={dict}
                      />
                    )}
                    {/* ── THE COLOURED ONES LAST ─────────────────────────
                        Chips and links were interleaved, so the right hand
                        end of every row was a different shape: a colour, then
                        two words, then a colour again on the next line down.
                        The links go first and the colours end the row, which
                        gives the list one edge to read down instead of three.
                        ── AND WHAT THE PERSON HAS OPEN ───────────────────
                        A follow-up belongs to the person, not to this call,
                        so the row shows it and does not offer to close it:
                        it was opened with a reason somebody wrote, and it is
                        closed on the record where that reason can be read.
                        Without it, a line could be ticked off as dealt with
                        while the person was still owed something, which is
                        the day and the record saying different things. */}
                    {known?.followUpSince && (
                      <Badge tone="warn">{dict.pacientes.followOpenTag}</Badge>
                    )}
                    {c.result && (
                      <Badge tone={CALL_TONE[c.result]}>{dict.status.call[c.result]}</Badge>
                    )}
                  </div>
                  {c.summary && (
                    <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-ink">
                      {c.summary}
                    </p>
                  )}
                </div>
                {/* ── AND WHAT HAS BEEN DONE ABOUT IT ────────────────────────
                    On its own line, under the message, because it is the
                    answer to the question the message asks. Above it the row
                    says what happened; here it says whether anybody has dealt
                    with it, and the two presses that change that. */}
                {readOnly ? (
                  done && (
                    <div className="mt-3">
                      <span className="badge gap-1.5 bg-ok-soft text-ok">
                        <IconCheck className="h-4 w-4" />
                        {dict.pacientes.callDoneAt.replace('{time}', formatTime(done, locale))}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="mt-3">
                    <CallWork
                      callId={c.id}
                      handledAt={done}
                      callbacks={stateOf(c).tries}
                      calledBackLabel={triedLabel(c)}
                      calledBackTone={triedTone(c)}
                      onHandled={markHandled}
                      // On the person where there is one, so their other
                      // rows this morning move with it.
                      onCalledBack={(at) =>
                        known
                          ? setRung((r) => ({
                              ...r,
                              // null, because this press says the clinic rang
                              // back and nothing about who answered. The
                              // record is where that gets decided.
                              [known.id]: [{ at, reached: null }, ...(r[known.id] ?? [])],
                            }))
                          : setWork((w) => ({
                              ...w,
                              [c.id]: {
                                ...(w[c.id] ?? asWritten(c)),
                                tries: (w[c.id] ?? asWritten(c)).tries + 1,
                                lastTry: at,
                              },
                            }))
                      }
                      dict={dict}
                      locale={locale}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ── AND THE WEEK, IN ONE GLANCE ──────────────────────────────────────
          Seven rows and two numbers each. Not a chart: a clinic wants to know
          whether Wednesday was busy and what happened on the day they were
          short at the desk, and both are answered by a number and a way in. */}
      <section className="mt-10">
        <h3 className="mb-3 text-lg font-semibold text-ink">{t.weekTitle}</h3>
        <ul className="overflow-hidden rounded-card border border-line">
          {week.map((d) => {
            const here = d.dayKey === dayKey
            return (
              <li key={d.dayKey} className="border-b border-line last:border-b-0">
                <Link
                  href={d.dayKey === todayKey ? '/hoje' : `/hoje?d=${d.dayKey}`}
                  aria-current={here ? 'page' : undefined}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors ${
                    here ? 'bg-accent-wash' : 'bg-surface hover:bg-surface-sunken'
                  }`}
                >
                  <span className="min-w-0 flex-1 text-base text-ink">{d.label}</span>
                  {/* Two figures, each with the icon that says which it is.
                      "0 +3" needed a legend to be read; this does not. */}
                  <span
                    className="flex items-center gap-1.5 text-base text-ink-soft"
                    title={t.doneCalls}
                  >
                    <IconPhone className="h-4 w-4" />
                    {d.answered}
                    <span className="sr-only">{t.doneCalls}</span>
                  </span>
                  {d.missed > 0 && (
                    <span className="flex items-center gap-1.5 text-base text-warn" title={t.doneMissed}>
                      <IconPhoneMissed className="h-4 w-4" />
                      {d.missed}
                      <span className="sr-only">{t.doneMissed}</span>
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

