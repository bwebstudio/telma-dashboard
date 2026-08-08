'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconClock } from '@/components/icons'
import { expireLapsedPreAppointments } from '@/lib/actions/hold'
import {
  CRITICAL_SECONDS,
  formatTimeRemaining,
  getPreAppointmentTimeRemaining,
  holdPercentage,
} from '@/lib/appointment-hold'
import type { Appointment } from '@/lib/types'

export interface CountdownLabels {
  /** "Confirma em", read before the MM:SS. */
  confirmIn: string
  /** Said once under five minutes. */
  critical: string
  expired: string
  /** For the bar, which has no visible label of its own. */
  aria: string
}

/**
 * How long is left to answer this pre-marcação.
 *
 * It counts locally. `expires_at` is a fixed instant the page already carries,
 * so there is nothing to ask the server for once a second; asking anyway would
 * be one request per booking per second from every open panel, to re-learn a
 * number nobody changed.
 *
 * It counts elapsed time, not wall clock. A receptionist's laptop can be a few
 * minutes off and the difference between "24:37 left" and "19:37 left" is the
 * difference between confirming and losing the booking, so the arithmetic
 * starts from what the server said when it drew the page and only ever adds the
 * seconds this component has watched go by.
 *
 * When it reaches zero it tells the database, which is the only thing allowed
 * to decide that a booking has lapsed.
 */
export function PreAppointmentCountdown({
  appointment,
  serverNow,
  labels,
  onExpired,
}: {
  appointment: Pick<Appointment, 'status' | 'expires_at'>
  /** When the server rendered the page. The zero of the local clock. */
  serverNow: string
  labels: CountdownLabels
  onExpired?: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Computed the same way on the server and on the first client render, so the
  // markup matches and hydration is quiet.
  const initial = getPreAppointmentTimeRemaining(appointment, new Date(serverNow).getTime())
  const [remaining, setRemaining] = useState(initial)
  const fired = useRef(false)

  useEffect(() => {
    if (initial === null || initial <= 0) return

    const startedAt = Date.now()
    const tick = () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      setRemaining(Math.max(0, initial - elapsed))
    }

    const id = window.setInterval(tick, 1000)
    // Coming back to a tab that slept: the interval did not run, and the number
    // on screen is as old as the nap.
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [initial])

  useEffect(() => {
    if (remaining !== 0 || fired.current) return
    fired.current = true

    startTransition(async () => {
      await expireLapsedPreAppointments()
      router.refresh()
    })
    onExpired?.()
  }, [remaining, onExpired, router])

  // Nothing to count: an answered booking, or one written before the window
  // existed. Those hold their hour until somebody decides, as they always did.
  if (remaining === null) return null

  const expired = remaining <= 0
  const critical = !expired && remaining <= CRITICAL_SECONDS
  const percent = holdPercentage(remaining)
  const tone = expired ? 'text-ink-mute' : critical ? 'text-danger' : 'text-ink-soft'
  const fill = expired ? 'bg-line-strong' : critical ? 'bg-danger' : 'bg-brand-accent'

  return (
    <div className="mt-1.5 w-full max-w-xs">
      <p className={`flex items-center gap-1.5 text-sm font-medium tabular-nums ${tone}`}>
        <IconClock className="h-4 w-4 shrink-0" />
        {expired ? (
          labels.expired
        ) : (
          <>
            {labels.confirmIn} {formatTimeRemaining(remaining)}
          </>
        )}
      </p>

      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-wash"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={labels.aria}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${fill}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {critical && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {labels.critical}
        </p>
      )}
    </div>
  )
}
