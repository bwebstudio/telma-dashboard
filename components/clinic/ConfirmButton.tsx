'use client'

import { useState, useTransition } from 'react'
import { confirmAppointment } from '@/lib/actions/appointments'
import { IconCheck } from '@/components/icons'

/**
 * "Yes, that booking is fine" — the answer nine bookings out of ten get, and
 * the one thing the agenda lets you do without leaving it.
 *
 * Changing the time or turning a patient away needs a reason and a second
 * thought, so those stay on the booking's own card. This is the one that should
 * cost a tap.
 */
export function ConfirmButton({ id, label }: { id: string; label: string }) {
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
              await confirmAppointment(id)
            } catch {
              setFailed(true)
            }
          })
        }}
        className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-pill bg-brand px-4 text-base font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
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
