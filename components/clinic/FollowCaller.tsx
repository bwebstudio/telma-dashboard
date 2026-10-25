'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import { createPatient } from '@/lib/actions/patients'

/**
 * From a message to a record, without typing a number.
 *
 * ── WHY THIS IS NEEDED AT ALL ──────────────────────────────────────────────
 * Everything the first client asked to be able to do with a message -- mark
 * when somebody rang back, whether they got through, whether it is dealt with
 * or still pending, write a note -- lives on a person's record. And a record
 * only ever came into being when a booking was made: `remember_patient` is
 * called from the appointments loop and nowhere else. A clinic whose Telma
 * does not book would therefore have had messages it could read and nobody to
 * follow up, unless somebody copied the number out by hand into a new record.
 *
 * So the message itself is the door. One press where the caller is already a
 * record, and where they are not, the name is typed once -- it is written in
 * the message two centimetres away -- and the record opens with the call
 * already on it, because calls attach to a record by the number they came
 * from.
 *
 * The name is confirmed rather than guessed. It used to be typed from nothing,
 * because the only place a name existed was inside the message as prose --
 * "Ana Martins quer remarcar" and "a senhora que ligou ontem" look the same to
 * a parser, and a record opened under the wrong name is worse than one more
 * field to fill. Now she sends the name she confirmed out loud in a field of
 * its own, so the box opens with it already in it and what is left is to agree
 * or to fix a letter. The field stays, because a name heard down a telephone
 * and a name a clinic will use for years are not quite the same thing.
 */
export function FollowCaller({
  phone,
  patientId,
  heardName,
  dict,
}: {
  /** The number the call came from, as it will be stored. */
  phone: string
  /** The record this caller already has, when they have one. */
  patientId: string | null
  /** The name Telma heard on this call, where she heard one.
   *
   *  Asking for it again was asking the desk to type something the panel
   *  already had on the line above: she asks the name on nearly every call,
   *  reads it back, and the person confirms it. So the field opens with it
   *  written in, and what is left to do is agree with it or correct a letter.
   *  Still a field and not a silent copy: what she heard is what somebody
   *  said down a telephone, and the record is what the clinic will call them
   *  for years. */
  heardName?: string | null
  dict: Dictionary
}) {
  const t = dict.pacientes
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(heardName?.trim() ?? '')
  const [error, setError] = useState(false)
  const [pending, start] = useTransition()

  if (patientId) {
    return (
      <Link
        href={`/pacientes/${patientId}`}
        className="text-sm text-brand-accent hover:text-brand-hover"
      >
        {t.openRecord}
      </Link>
    )
  }

  if (!open) {
    return (
      <button
        className="text-sm text-brand-accent hover:text-brand-hover"
        onClick={() => setOpen(true)}
      >
        {t.followCaller}
      </button>
    )
  }

  const create = () =>
    start(async () => {
      setError(false)
      try {
        const id = await createPatient(name, phone)
        if (id) router.push(`/pacientes/${id}`)
      } catch {
        setError(true)
      }
    })

  return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && !pending) create()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={t.callerName}
        aria-label={t.callerName}
        className="field-input min-w-0 flex-1 basis-56 py-2"
      />
      <button
        className="btn-primary min-h-0 shrink-0 px-4 py-2 text-sm"
        disabled={pending || !name.trim()}
        onClick={create}
      >
        {t.createRecord}
      </button>
      <button
        className="btn-ghost min-h-0 shrink-0 px-3 py-2 text-sm"
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        {dict.common.cancel}
      </button>
      {error && (
        <span role="alert" className="text-sm font-medium text-danger">
          {dict.common.errorGeneric}
        </span>
      )}
    </span>
  )
}
