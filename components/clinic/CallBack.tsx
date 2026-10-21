'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import { logCallback } from '@/lib/actions/patients'
import { formatTime } from '@/lib/format'

/**
 * "Já liguei de volta", on the one call that has nobody to write it on.
 *
 * ── WHERE THIS BELONGS AND WHERE IT DOES NOT ───────────────────────────────
 * Everything a clinic does about a person belongs on that person's record:
 * the attempts, whether they got through, whether it is dealt with. That
 * works because a record is a person with a name.
 *
 * A call where somebody hung up while it was ringing has no person. Nobody
 * spoke, so there is no name to open a record under, and a patients list half
 * full of bare telephone numbers would be the thing the clinic has to live
 * with on the day Telma starts booking for them.
 *
 * So this one mark lives on the call, says only how many times and when, and
 * stops the moment it is no longer needed: when somebody finally answers, the
 * clinic learns the name, opens the record from the message, and every call
 * from that number is already inside it.
 */
export function CallBack({
  callId,
  callbacks,
  calledBackAt,
  dict,
  locale,
}: {
  callId: string
  callbacks: number
  calledBackAt: string | null
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.pacientes
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  // ── COUNTED HERE AS WELL AS ON THE SERVER ────────────────────────────────
  // The row has to change the moment it is pressed. Waiting for the screen to
  // come back from the server leaves the same words under the finger for a
  // second or two, and the one thing somebody does with a button that seems
  // not to have worked is press it again -- on a counter, which would then be
  // wrong. The server stays the truth: the next load reads it back.
  const [count, setCount] = useState(callbacks)
  const [at, setAt] = useState(calledBackAt)

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {count > 0 && (
        <span className="text-sm text-ink-mute">
          {count === 1 && at
            ? t.calledBackAt.replace('{time}', formatTime(at, locale))
            : t.calledBackTimes.replace('{n}', String(count))}
        </span>
      )}
      <button
        className="text-sm text-brand-accent hover:text-brand-hover"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(false)
            try {
              await logCallback(callId)
              setCount((n) => n + 1)
              setAt(new Date().toISOString())
              // For everything else on the screen that counts these.
              router.refresh()
            } catch {
              setFailed(true)
            }
          })
        }
      >
        {count > 0 ? t.calledBackAgain : t.calledBack}
      </button>
      {failed && (
        <span role="alert" className="text-sm font-medium text-danger">
          {dict.common.errorGeneric}
        </span>
      )}
    </span>
  )
}
