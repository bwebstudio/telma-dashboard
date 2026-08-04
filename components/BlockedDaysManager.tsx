'use client'

import { useState, useTransition } from 'react'
import type { Dictionary, Locale } from '@/content'
import type { BlockedDay } from '@/lib/types'
import { formatDate } from '@/lib/format'
import { addBlockedDay, removeBlockedDay } from '@/lib/actions/availability'
import { IconPlus, IconClose } from './icons'

export function BlockedDaysManager({
  days,
  dict,
  locale,
  readOnly = false,
}: {
  days: BlockedDay[]
  dict: Dictionary
  locale: Locale
  /** The administrator looking at a client's panel reads the list, never edits it. */
  readOnly?: boolean
}) {
  const [day, setDay] = useState('')
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  function add() {
    if (!day) return
    setError(false)
    start(async () => {
      try {
        await addBlockedDay(day, reason)
        setDay('')
        setReason('')
      } catch {
        setError(true)
      }
    })
  }

  function remove(id: string) {
    setError(false)
    start(async () => {
      try {
        await removeBlockedDay(id)
      } catch {
        setError(true)
      }
    })
  }

  return (
    <div>
      {!readOnly && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-48">
          <label htmlFor="block-day" className="field-label">
            {dict.horarios.blockDayLabel}
          </label>
          <input
            id="block-day"
            type="date"
            className="field-input"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="block-reason" className="field-label">
            {dict.horarios.blockReason} <span className="text-ink-mute">({dict.common.optional})</span>
          </label>
          <input
            id="block-reason"
            type="text"
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={add} disabled={pending || !day}>
          <IconPlus className="h-5 w-5" />
          {dict.horarios.addBlock}
        </button>
      </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}

      <ul className={`flex flex-col divide-y divide-line ${readOnly ? '' : 'mt-6'}`}>
        {days.length === 0 ? (
          <li className="py-3 text-base text-ink-mute">{dict.horarios.noBlocked}</li>
        ) : (
          days.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 py-3">
              <span className="text-base text-ink">
                {formatDate(d.day, locale)}
                {d.reason && <span className="ml-2 text-ink-mute">{d.reason}</span>}
              </span>
              {!readOnly && (
                <button
                  onClick={() => remove(d.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 text-sm text-ink-mute hover:text-danger"
                >
                  <IconClose className="h-4 w-4" />
                  {dict.horarios.remove}
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
