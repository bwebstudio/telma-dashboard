'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import { setCallHandled } from '@/lib/actions/patients'
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
 * And on the day's list, what else the row says about the work.
 *
 * ── THE CALLBACK BUTTONS ARE GONE, AND THAT WAS ASKED FOR ──────────────────
 * This had "liguei e falei" and "liguei, não atendeu" beside "tratado", which
 * wrote the attempt into the person's history from the day's list. Reception
 * asked for one action on this screen and only one: today is for reading what
 * happened and closing what is done, and ringing somebody back is work that
 * belongs on their record, where the form has room for what was said.
 *
 * The line stays. Where the record already holds an attempt, the row says so
 * -- "falámos com a pessoa às 13:46", in green, with the count -- because that
 * is the one thing somebody closing a morning needs to know and did not want
 * to go and look for.
 *
 * `logCallback` in lib/actions/patients is intact and now has no screen
 * calling it. It is left there, with its own note, for when this comes back.
 */
export function CallWork({
  callId,
  handledAt,
  calledBackLabel,
  calledBackTone = 'mute',
  onHandled,
  dict,
  locale,
}: {
  callId: string
  handledAt: string | null
  /** Written out by the list, because only it knows which day this call was
   *  on and therefore whether an hour on its own says enough. */
  calledBackLabel: string | null
  /** How the last attempt went, as a colour: green where the clinic spoke to
   *  them, amber where nobody picked up, grey where whoever pressed it claimed
   *  nothing. Reception reads a morning by the shape of it. */
  calledBackTone?: 'ok' | 'warn' | 'mute'
  onHandled: (at: string | null, ids: string[]) => void
  dict: Dictionary
  locale: Locale
}) {
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
    </span>
  )
}
