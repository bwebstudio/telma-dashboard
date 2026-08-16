'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { erasePatient, previewPatientData, type PatientData } from '@/lib/actions/erasure'
import { fill } from '@/lib/fill'

/**
 * The clinic answering a patient who asks to be forgotten.
 *
 * Look first, then erase. The preview is not politeness: this cannot be undone,
 * and the number is typed by somebody reading it off a screen or hearing it
 * down a telephone. Seeing "one booking, Ana Torres" before pressing is the
 * difference between erasing the right person and erasing a stranger.
 *
 * What survives is said out loud in the copy rather than buried in a policy:
 * the appointment stays, without a name on it, because it is the clinic's
 * record of an afternoon it worked as much as it is the patient's data.
 */
export function ErasureForm({ dict }: { dict: Dictionary }) {
  const t = dict.erasure
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState('')
  const [found, setFound] = useState<PatientData | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const look = () => {
    setError(null)
    setDone(null)
    start(async () => {
      try {
        setFound(await previewPatientData(phone))
      } catch {
        setError(dict.common.errorGeneric)
      }
    })
  }

  const erase = () => {
    setError(null)
    start(async () => {
      try {
        const r = await erasePatient(phone, reference)
        setDone(fill(t.doneCount, { a: r.appointments_anonymised, c: r.calls_redacted }))
        setFound(null)
        setPhone('')
        setReference('')
      } catch {
        setError(dict.common.errorGeneric)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-ink-soft">{t.help}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="field-label">{t.phoneLabel}</span>
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setFound(null)
            }}
            inputMode="tel"
            placeholder="+34 600 000 000"
            className="field-input w-56"
          />
        </label>
        <button
          type="button"
          onClick={look}
          disabled={pending || phone.trim().length < 6}
          className="btn-secondary"
        >
          {t.look}
        </button>
      </div>

      {found && (
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          {found.appointments === 0 && found.calls === 0 ? (
            <p className="text-base text-ink">{t.nothingFound}</p>
          ) : (
            <>
              <p className="text-base text-ink">
                {fill(t.foundCount, { a: found.appointments, c: found.calls })}
                {found.names.length > 0 && <strong> {found.names.join(', ')}</strong>}
              </p>
              <p className="mt-2 text-sm text-ink-mute">{t.whatSurvives}</p>

              <label className="mt-4 flex flex-col gap-1.5">
                <span className="field-label">{t.referenceLabel}</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t.referencePlaceholder}
                  className="field-input"
                />
              </label>

              <button
                type="button"
                onClick={erase}
                disabled={pending}
                className="mt-4 rounded-card bg-danger px-4 py-2.5 text-base font-medium text-white"
              >
                {t.erase}
              </button>
            </>
          )}
        </div>
      )}

      {done && (
        <p role="status" className="text-base font-medium text-ok">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
