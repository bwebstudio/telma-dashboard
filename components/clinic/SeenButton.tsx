'use client'

import { useState, useTransition } from 'react'
import { acknowledgeCancellation } from '@/lib/actions/appointments'
import { IconCheck } from '@/components/icons'

/**
 * "I know about this one."
 *
 * A cancellation is not a task with a right answer — the clinic may call the
 * patient back, may just free the slot, may do nothing. What it needs is a way
 * to say it has been read, so the band can stop showing it without waiting for
 * a timer to decide on the reader's behalf.
 *
 * The booking is untouched: the hour still shows as cancelled in the agenda.
 * Only the alert goes quiet.
 */
export function SeenButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFailed(false)
          start(async () => {
            try {
              await acknowledgeCancellation(id)
            } catch {
              setFailed(true)
            }
          })
        }}
        className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-pill border border-warn/40 bg-surface px-4 text-base font-medium text-warn transition-colors hover:bg-warn hover:text-white disabled:opacity-50"
      >
        <IconCheck className="h-4 w-4" />
        {label}
      </button>
      {failed && (
        <span role="alert" className="text-sm font-medium text-danger">
          !
        </span>
      )}
    </span>
  )
}
