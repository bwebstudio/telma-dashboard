'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import type { AvailabilitySlot } from '@/lib/types'
import { toggleSlot } from '@/lib/actions/availability'
import { IconCheck } from './icons'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 08:00 .. 19:00
const COLUMNS = [1, 2, 3, 4, 5, 6, 0] // Monday first, Sunday last (Postgres dow)

const key = (wd: number, h: number) => `${wd}-${h}`
const pad = (n: number) => String(n).padStart(2, '0')

export function AvailabilityGrid({
  slots,
  dict,
}: {
  slots: AvailabilitySlot[]
  dict: Dictionary
}) {
  const [active, setActive] = useState<Set<string>>(
    () => new Set(slots.map((s) => key(s.weekday, parseInt(s.start_time.slice(0, 2), 10))))
  )
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  function toggle(wd: number, h: number) {
    const k = key(wd, h)
    const next = new Set(active)
    const wasOn = next.has(k)
    if (wasOn) next.delete(k)
    else next.add(k)
    setActive(next)
    setError(false)
    start(async () => {
      try {
        await toggleSlot(wd, h)
      } catch {
        // revert on failure
        setError(true)
        setActive((cur) => {
          const rb = new Set(cur)
          if (wasOn) rb.add(k)
          else rb.delete(k)
          return rb
        })
      }
    })
  }

  return (
    <div>
      <p className="mb-3 text-base text-ink-soft">{dict.horarios.gridHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-14" />
              {COLUMNS.map((wd) => (
                <th key={wd} className="label-caps pb-1 text-center">
                  {dict.weekdays[wd].slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <th className="pr-2 text-right align-middle text-sm font-medium text-ink-mute">
                  {pad(h)}:00
                </th>
                {COLUMNS.map((wd) => {
                  const on = active.has(key(wd, h))
                  return (
                    <td key={wd} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggle(wd, h)}
                        disabled={pending}
                        aria-pressed={on}
                        aria-label={`${dict.weekdays[wd]} ${pad(h)}:00`}
                        className={`flex h-11 w-full min-w-[2.75rem] items-center justify-center rounded-lg border transition-colors ${
                          on
                            ? 'border-brand bg-brand text-white'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-surface-sunken'
                        }`}
                      >
                        {on && <IconCheck className="h-4 w-4" />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink-mute">{dict.horarios.capacityNote}</p>
      {error && (
        <p role="alert" className="mt-2 text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}
    </div>
  )
}
