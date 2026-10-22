'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import { logCallback, setCallHandled } from '@/lib/actions/patients'
import { formatTime } from '@/lib/format'
import { IconCheck } from '@/components/icons'

/**
 * Whether anybody has dealt with this call, and the two presses that say so.
 *
 * ── WHAT THE DAY IS FOR ────────────────────────────────────────────────────
 * Reception reads the list from the top and asks one question of every line:
 * has somebody taken care of this? The answer used to live inside the
 * person's record, a click and a back button away, and on a morning with
 * fifteen messages nobody opens fifteen records. So the list could be read
 * and not worked through, which is the only thing it exists for.
 *
 * ── TWO SENTENCES, NOT ONE ─────────────────────────────────────────────────
 * "I rang them back" is the work, and it can happen three times without
 * anything being resolved. "This is dealt with" is the end of it. They are
 * different facts and both are worth one press, so there are two buttons and
 * never a hidden rule that one implies the other.
 *
 * What is NOT here is the person's follow-up. "This call is dealt with" and
 * "this person still owes us something" are different scopes: somebody can
 * have a message sorted out this morning and a report still pending from
 * last month. That one lives on their record, which is where a history
 * belongs.
 *
 * ── WHY THE DONE ROW GOES QUIET ────────────────────────────────────────────
 * Not a colour for pending, which would paint the whole list amber at nine in
 * the morning and teach everybody to ignore it. The opposite: what is done
 * fades, so the list visibly empties as the morning is worked through, and
 * what is left is what is left.
 */
export function CallWork({
  callId,
  handledAt,
  callbacks,
  calledBackAt,
  onHandled,
  onCalledBack,
  dict,
  locale,
}: {
  callId: string
  handledAt: string | null
  callbacks: number
  calledBackAt: string | null
  /** Told to the list, which is where the day's figures are counted. */
  onHandled: (at: string | null) => void
  onCalledBack: (at: string) => void
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  // ── THE ROW DOES NOT REMEMBER, THE LIST DOES ─────────────────────────────
  // Both of these change a number in the day's heading as well as this line,
  // and two copies of the same fact drift. So the state is held once, by the
  // list, and this is told what to draw and what to call. See MessagesDay.
  const done = handledAt
  const tries = callbacks
  const lastTry = calledBackAt

  const act = (fn: () => Promise<void>, after: () => void) =>
    start(async () => {
      setFailed(false)
      try {
        await fn()
        after()
        router.refresh()
      } catch {
        setFailed(true)
      }
    })

  if (done) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-mute">
        <span className="flex items-center gap-1.5 text-ok">
          <IconCheck className="h-4 w-4" />
          {t.callDoneAt.replace('{time}', formatTime(done, locale))}
        </span>
        <button
          className="text-sm text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
          disabled={pending}
          onClick={() => act(() => setCallHandled(callId, false), () => onHandled(null))}
        >
          {t.callReopen}
        </button>
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        className="btn-secondary min-h-0 px-3 py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          act(
            () => setCallHandled(callId, true),
            () => onHandled(new Date().toISOString())
          )
        }
      >
        {t.callDone}
      </button>
      <button
        className="btn-ghost min-h-0 px-3 py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          act(() => logCallback(callId), () => onCalledBack(new Date().toISOString()))
        }
      >
        {tries > 0 ? t.calledBackAgain : t.calledBack}
      </button>
      {tries > 0 && (
        <span className="text-sm text-ink-mute">
          {tries === 1 && lastTry
            ? t.calledBackAt.replace('{time}', formatTime(lastTry, locale))
            : t.calledBackTimes.replace('{n}', String(tries))}
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
