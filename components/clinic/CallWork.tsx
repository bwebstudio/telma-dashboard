'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import { logCallback, setCallHandled } from '@/lib/actions/patients'
import { formatTime } from '@/lib/format'
import { IconCheck } from '@/components/icons'

/**
 * "This call is dealt with", and the way back out of it.
 *
 * ── WHAT THE DAY IS FOR ────────────────────────────────────────────────────
 * Reception reads the list from the top and asks one question of every line:
 * has somebody taken care of this? The answer used to live inside the
 * person's record, a click and a back button away, and on a morning with
 * fifteen messages nobody opens fifteen records. So the list could be read
 * and not worked through, which is the only thing it exists for.
 *
 * ── ONE FACT, TWO SCREENS, NO COPY OF IT ───────────────────────────────────
 * This is its own component because the day's list is not the only place the
 * question gets asked. Somebody opening a person's record wants the same
 * answer about the same calls, and used to get a history that said a call had
 * happened and nothing about whether anybody had done anything about it. Both
 * screens draw this, both read `calls.handled_at` and both call the same
 * action, so there is nothing to keep in step: the state is in one place and
 * each screen is a view of it. Anything else is two truths about one call,
 * and whichever got looked at second would be the wrong one.
 *
 * ── WHY THE DONE ROW GOES QUIET AND THE MARK DOES NOT ──────────────────────
 * Not a colour for pending, which would paint the whole list amber at nine in
 * the morning and teach everybody to ignore it. The opposite: what is done
 * fades, so the list visibly empties as the morning is worked through, and
 * what is left is what is left.
 *
 * The one thing that does not fade is this mark. The row behind it is dim
 * because nobody needs to read it again; the green tick is what somebody
 * scrolling is looking for, and a dim tick is a tick you have to go looking
 * for. So the card is held at the parent's opacity and this sits outside it,
 * at full strength. See MessagesDay.
 *
 * What is NOT here is the person's follow-up. "This call is dealt with" and
 * "this person still owes us something" are different scopes: somebody can
 * have a message sorted out this morning and a report still pending from
 * last month. That one lives on their record, and it reaches in the other
 * direction: closing it closes the calls. See setFollowUp.
 */
export function CallHandled({
  callId,
  handledAt,
  onHandled,
  dict,
  locale,
}: {
  callId: string
  handledAt: string | null
  /** Told to whichever list is drawing this. The ids are every call the press
   *  reached: one person's older calls go quiet with this one, and the rows
   *  have to move together. */
  onHandled: (at: string | null, ids: string[]) => void
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  // How many OTHER calls that press closed. Said once, as feedback for the
  // thing that just happened, and not kept anywhere: tomorrow the number
  // means nothing and the card is quiet either way.
  const [alsoClosed, setAlsoClosed] = useState(0)
  // ── THE ROW DOES NOT REMEMBER, THE LIST DOES ─────────────────────────────
  // Both of these change a number in the day's heading as well as this line,
  // and two copies of the same fact drift. So the state is held once, by the
  // list, and this is told what to draw and what to call. See MessagesDay.
  const done = handledAt

  const act = (fn: () => Promise<void>) =>
    start(async () => {
      setFailed(false)
      try {
        await fn()
        router.refresh()
      } catch {
        setFailed(true)
      }
    })

  if (done) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="badge gap-1.5 bg-ok-soft text-ok">
          <IconCheck className="h-4 w-4" />
          {t.callDoneAt.replace('{time}', formatTime(done, locale))}
        </span>
        {alsoClosed > 0 && (
          <span className="text-sm text-ink-mute">
            {t.callDoneAlso.replace('{n}', String(alsoClosed))}
          </span>
        )}
        <button
          className="text-sm text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const { ids } = await setCallHandled(callId, false)
              setAlsoClosed(0)
              onHandled(null, ids)
            })
          }
        >
          {t.callReopen}
        </button>
        {failed && (
          <span role="alert" className="text-sm font-medium text-danger">
            {dict.common.errorGeneric}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        className="btn-secondary min-h-0 px-3 py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          act(async () => {
            const { at, ids } = await setCallHandled(callId, true)
            setAlsoClosed(Math.max(0, ids.length - 1))
            onHandled(at ?? new Date().toISOString(), ids)
          })
        }
      >
        {t.callDone}
      </button>
      {failed && (
        <span role="alert" className="text-sm font-medium text-danger">
          {dict.common.errorGeneric}
        </span>
      )}
    </span>
  )
}

/**
 * And on the day's list, the other half: ringing them back.
 *
 * Two sentences, not one. "I rang them back" is the work and can happen three
 * times without anything being resolved; "this is dealt with" is the end of
 * it. Neither implies the other, so there are two presses.
 *
 * ── WHY THE COUNT IS NOT ALWAYS THE CALL'S OWN ─────────────────────────────
 * An attempt is a thing that happened to a person, not to a call: somebody
 * who rang three times this week and was rung back once has been rung back
 * once, however many lines that spreads over. So where the caller has a
 * record, this writes into their history and reads the count back from it,
 * which is the same history the record's own "registar tentativa" writes to
 * and the same one it counts. One log, two doors into it.
 *
 * Where the caller has no record there is no history to write to, and the
 * count on the call itself is the only place it can live. Nothing contradicts
 * anything there either: a caller with no record has no second screen.
 */
export function CallWork({
  callId,
  handledAt,
  callbacks,
  calledBackLabel,
  calledBackTone = 'mute',
  onHandled,
  onCalledBack,
  dict,
  locale,
}: {
  callId: string
  handledAt: string | null
  /** How many times this person has been rung back, from their record where
   *  they have one and from the call itself where they do not. */
  callbacks: number
  /** Written out by the list, because only it knows which day this call was
   *  on and therefore whether an hour on its own says enough. */
  calledBackLabel: string | null
  /** How that attempt went, as a colour: green where the clinic spoke to
   *  them, amber where nobody picked up, grey where the press claimed
   *  nothing. Reception reads a morning by the shape of it, and three
   *  different outcomes in one grey is how the one that closes the matter
   *  gets missed. */
  calledBackTone?: 'ok' | 'warn' | 'mute'
  onHandled: (at: string | null, ids: string[]) => void
  onCalledBack: (at: string) => void
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)

  if (handledAt) {
    return (
      <CallHandled
        callId={callId}
        handledAt={handledAt}
        onHandled={onHandled}
        dict={dict}
        locale={locale}
      />
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <CallHandled
        callId={callId}
        handledAt={null}
        onHandled={onHandled}
        dict={dict}
        locale={locale}
      />
      <button
        className="btn-ghost min-h-0 px-3 py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(false)
            try {
              await logCallback(callId)
              onCalledBack(new Date().toISOString())
              router.refresh()
            } catch {
              setFailed(true)
            }
          })
        }
      >
        {callbacks > 0 ? t.calledBackAgain : t.calledBack}
      </button>
      {calledBackLabel && (
        <span
          className={`text-sm ${
            calledBackTone === 'ok'
              ? 'font-medium text-ok'
              : calledBackTone === 'warn'
                ? 'font-medium text-warn'
                : 'text-ink-mute'
          }`}
        >
          {calledBackLabel}
        </span>
      )}
      {failed && (
        <span role="alert" className="text-sm font-medium text-danger">
          {dict.common.errorGeneric}
        </span>
      )}
    </span>
  )
}
