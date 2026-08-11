'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import type { AvailabilitySlot } from '@/lib/types'
import {
  addResource,
  removeResource,
  renameResource,
  saveDayHours,
  setSlotStep,
} from '@/lib/actions/availability'
import type { Resource } from '@/lib/types'

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
  resources,
  dict,
  readOnly = false,
}: {
  slots: AvailabilitySlot[]
  step: number
  /** Always at least one. The clinic sees none of this until there are two. */
  resources: Resource[]
  dict: Dictionary
  /** The administrator looking at a client's panel reads the hours, never sets
   *  them: a schedule changed by somebody who is not there is a patient sent to
   *  a closed door. */
  readOnly?: boolean
}) {
  const [who, setWho] = useState<string>(resources[0]?.id ?? '')
  const mine = resources.length > 1 ? slots.filter((s) => s.resource_id === who) : slots

  const [days, setDays] = useState<Record<number, Window[]>>(() => byWeekday(slots))
  // Switching diaries re-reads from the rows rather than keeping an edit, which
  // would otherwise be saved against whoever was selected afterwards.
  const [shown, setShown] = useState(who)
  if (shown !== who) {
    setShown(who)
    setDays(byWeekday(mine))
  }
  const [minutes, setMinutes] = useState(step)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const commit = (wd: number, windows: Window[]) => {
    setDays((d) => ({ ...d, [wd]: windows }))
    if (readOnly) return
    setError(null)
    start(async () => {
      try {
        await saveDayHours(wd, windows, resources.length > 1 ? who : undefined)
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

      <Diaries
        resources={resources}
        who={who}
        setWho={setWho}
        dict={dict}
        readOnly={readOnly}
        pending={pending}
        onError={setError}
        run={start}
      />

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

/** The rows of one diary, grouped by weekday and in order. */
function byWeekday(slots: AvailabilitySlot[]): Record<number, Window[]> {
  const byDay: Record<number, Window[]> = {}
  for (const wd of COLUMNS) byDay[wd] = []
  for (const s of slots) {
    byDay[s.weekday] ??= []
    byDay[s.weekday].push({ open: hhmm(s.start_time), close: hhmm(s.end_time) })
  }
  for (const wd of COLUMNS) byDay[wd].sort((a, b) => a.open.localeCompare(b.open))
  return byDay
}

/**
 * Whose diary is being edited, and the way a second one comes into existence.
 *
 * With one diary there is a single quiet line at the top: "there is more than
 * one of us". No tabs, no selector, no word the clinic did not ask for. A
 * person working alone reads that line, recognises it does not apply, and never
 * thinks about any of this again.
 *
 * Adding somebody is what makes the machinery appear. That is deliberate, and
 * it is the alternative to a setting called "advanced mode": a toggle would put
 * the decision in front of everybody, including the people it is not for, and
 * ask them to understand it before they have any reason to.
 */
function Diaries({
  resources,
  who,
  setWho,
  dict,
  readOnly,
  pending,
  onError,
  run,
}: {
  resources: Resource[]
  who: string
  setWho: (id: string) => void
  dict: Dictionary
  readOnly: boolean
  pending: boolean
  onError: (message: string | null) => void
  run: (fn: () => void) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const many = resources.length > 1

  const submit = () => {
    const clean = name.trim()
    if (!clean) return setAdding(false)
    setName('')
    setAdding(false)
    onError(null)
    run(async () => {
      try {
        await addResource(clean)
      } catch {
        onError(dict.common.errorGeneric)
      }
    })
  }

  return (
    <div className="mb-5">
      {many && (
        <div className="mb-3 flex flex-wrap gap-2">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setWho(r.id)}
              aria-pressed={r.id === who}
              className={`rounded-card border px-3.5 py-2 text-base transition-colors ${
                r.id === who
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink hover:border-line-strong'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {!readOnly &&
        (adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') setAdding(false)
              }}
              onBlur={submit}
              aria-label={dict.horarios.professionalName}
              placeholder={dict.horarios.professionalName}
              className="rounded-card border border-line bg-surface px-3 py-2 text-base text-ink"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={pending}
            className="text-sm text-brand underline underline-offset-2"
          >
            {dict.horarios.addProfessional}
          </button>
        ))}

      {many && !readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const current = resources.find((r) => r.id === who)
              const next = window.prompt(dict.horarios.professionalName, current?.name ?? '')
              if (!next?.trim()) return
              onError(null)
              run(async () => {
                try {
                  await renameResource(who, next)
                } catch {
                  onError(dict.common.errorGeneric)
                }
              })
            }}
            className="text-sm text-ink-mute underline underline-offset-2"
          >
            {dict.horarios.renameProfessional}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              onError(null)
              run(async () => {
                try {
                  await removeResource(who)
                  setWho(resources.find((r) => r.id !== who)?.id ?? '')
                } catch (e) {
                  onError(
                    String(e).includes('last_resource')
                      ? dict.horarios.lastProfessional
                      : dict.common.errorGeneric
                  )
                }
              })
            }}
            className="text-sm text-ink-mute underline underline-offset-2"
          >
            {dict.horarios.removeProfessional}
          </button>
        </div>
      )}

      {many && <p className="mt-2 text-sm text-ink-mute">{dict.horarios.professionalHint}</p>}
    </div>
  )
}
