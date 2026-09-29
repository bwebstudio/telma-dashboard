'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { createPatient } from '@/lib/actions/patients'

/**
 * Opening a record for somebody standing at the desk.
 *
 * Two fields, because two is what a record is. Anything else about them is
 * written on the record afterwards, by somebody who has it open, rather than
 * asked for here by a form that does not know yet whether it will be needed.
 */
export function NewPatient({ dict }: { dict: Dictionary }) {
  const t = dict.pacientes
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        {t.addPatient}
      </button>
    )
  }

  return (
    <div className="mb-6 rounded-card border border-line bg-surface-sunken p-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <label className="field-label" htmlFor="new-name">
            {t.addName}
          </label>
          <input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="field-label" htmlFor="new-phone">
            {t.addPhone}
          </label>
          <input
            id="new-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="field-input"
          />
          <p className="mt-1 text-sm text-ink-mute">{t.addPhoneHint}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-base font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          className="btn-primary"
          disabled={pending || !name.trim() || !phone.trim()}
          onClick={() =>
            start(async () => {
              setError(null)
              try {
                const id = await createPatient(name, phone)
                setOpen(false)
                setName('')
                setPhone('')
                // Straight onto the record, because the reason anybody opens one
                // is to write something on it.
                if (id) router.push(`/pacientes/${id}`)
              } catch (e) {
                setError(
                  e instanceof Error && e.message === 'phone_required'
                    ? t.addPhoneHint
                    : dict.common.errorGeneric
                )
              }
            })
          }
        >
          {dict.common.save}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>
          {dict.common.cancel}
        </button>
      </div>
    </div>
  )
}
