'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import type { AvailabilitySlot } from '@/lib/types'
import { saveDayHours, setSlotStep } from '@/lib/actions/availability'

/**
 * When the clinic is open, written the way a clinic writes it.
 *
 * This replaced a grid of tick boxes, one per whole hour. The grid was easy to
 * read and could not express the truth: a clinic open from three in the
 * afternoon until quarter to ten had no way to say quarter to ten, because the
 * only thing it could store was an integer hour. Twelve rows of boxes also made
 * a seven day week look like eighty-four decisions instead of seven.
 *
 * A day is a list of periods. Most clinics have one, or two with lunch between
 * them, and the second only appears when somebody asks for it.
 *
 * Saving happens per day, on blur, and replaces that day entirely: opening
 * hours are one answer to one question, and applying half of an edit is how a
 * clinic ends up open at a time it has just closed.
 */

const COLUMNS = [1, 2, 3, 4, 5, 6, 0] // Monday first, Sunday last (Postgres dow)
const STEPS = [10, 15, 20, 30, 45, 60]

interface Window {
  open: string
  close: string
}

const hhmm = (t: string) => t.slice(0, 5)

export function OpeningHours({
  slots,
  step,
  dict,
  readOnly = false,
}: {
  slots: AvailabilitySlot[]
  step: number
  dict: Dictionary
  /** The administrator looking at a client's panel reads the hours, never sets
   *  them: a schedule changed by somebody who is not there is a patient sent to
   *  a closed door. */
  readOnly?: boolean
}) {
  const [days, setDays] = useState<Record<number, Window[]>>(() => {
    const byDay: Record<number, Window[]> = {}
    for (const wd of COLUMNS) byDay[wd] = []
    for (const s of slots) {
      byDay[s.weekday] ??= []
      byDay[s.weekday].push({ open: hhmm(s.start_time), close: hhmm(s.end_time) })
    }
    for (const wd of COLUMNS) byDay[wd].sort((a, b) => a.open.localeCompare(b.open))
    return byDay
  })
  const [minutes, setMinutes] = useState(step)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const commit = (wd: number, windows: Window[]) => {
    setDays((d) => ({ ...d, [wd]: windows }))
    if (readOnly) return
    setError(null)
    start(async () => {
      try {
        await saveDayHours(wd, windows)
      } catch (e) {
        setError(
          String(e).includes('overlapping_windows')
            ? dict.horarios.overlaps
            : dict.common.errorGeneric
        )
      }
    })
  }

  const edit = (wd: number, index: number, patch: Partial<Window>) => {
    const next = days[wd].map((w, i) => (i === index ? { ...w, ...patch } : w))
    setDays((d) => ({ ...d, [wd]: next }))
  }

  return (
    <div>
      <p className="mb-4 text-base text-ink-soft">
        {readOnly ? dict.horarios.gridReadOnly : dict.horarios.help}
      </p>

      <div className="flex flex-col gap-2">
        {COLUMNS.map((wd) => {
          const windows = days[wd] ?? []
          const open = windows.length > 0
          return (
            <div
              key={wd}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-start sm:gap-4"
            >
              <label className="flex min-w-[9rem] shrink-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={open}
                  disabled={pending || readOnly}
                  onChange={(e) =>
                    // Turning a day on offers the shape almost every clinic
                    // wants, rather than an empty pair of boxes that has to be
                    // filled in before anything means anything.
                    commit(wd, e.target.checked ? [{ open: '09:00', close: '19:00' }] : [])
                  }
                  className="h-5 w-5 shrink-0 accent-brand"
                />
                <span className="text-base font-medium text-ink">{dict.weekdays[wd]}</span>
              </label>

              {!open ? (
                <span className="self-center text-base text-ink-mute">
                  {dict.horarios.closedDay}
                </span>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {windows.map((w, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Time
                        label={`${dict.weekdays[wd]} ${dict.horarios.openLabel}`}
                        value={w.open}
                        disabled={pending || readOnly}
                        onChange={(v) => edit(wd, i, { open: v })}
                        onDone={() => commit(wd, days[wd])}
                      />
                      <span className="text-sm text-ink-mute">–</span>
                      <Time
                        label={`${dict.weekdays[wd]} ${dict.horarios.closeLabel}`}
                        value={w.close}
                        disabled={pending || readOnly}
                        onChange={(v) => edit(wd, i, { close: v })}
                        onDone={() => commit(wd, days[wd])}
                      />
                      {windows.length > 1 && !readOnly && (
                        <button
                          type="button"
                          onClick={() => commit(wd, windows.filter((_, j) => j !== i))}
                          disabled={pending}
                          className="text-sm text-ink-mute underline underline-offset-2"
                        >
                          {dict.horarios.removeWindow}
                        </button>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        commit(wd, [...windows, { open: '15:00', close: '20:00' }])
                      }
                      disabled={pending}
                      className="self-start text-sm text-brand underline underline-offset-2"
                    >
                      {dict.horarios.addWindow}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="slot-step" className="text-base text-ink">
          {dict.horarios.stepLabel}
        </label>
        <select
          id="slot-step"
          value={minutes}
          disabled={pending || readOnly}
          onChange={(e) => {
            const v = Number(e.target.value)
            setMinutes(v)
            setError(null)
            start(async () => {
              try {
                await setSlotStep(v)
              } catch {
                setError(dict.common.errorGeneric)
              }
            })
          }}
          className="rounded-card border border-line bg-surface px-3 py-2 text-base text-ink"
        >
          {STEPS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 text-sm text-ink-mute">{dict.horarios.stepHelp}</p>

      {error && (
        <p role="alert" className="mt-3 text-base font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * A time, typed or picked.
 *
 * `type="time"` because a phone then offers its own wheel and a desktop offers
 * a keyboard, which is the right answer on both without this file deciding
 * which one somebody is holding.
 */
function Time({
  label,
  value,
  disabled,
  onChange,
  onDone,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
  onDone: () => void
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      // Saved when the box is left rather than on every keystroke: a half typed
      // "1" is a real time and would be written down as one o'clock in the
      // morning before the second digit arrived.
      onBlur={onDone}
      className="rounded-card border border-line bg-surface px-3 py-2 text-base text-ink"
    />
  )
}
