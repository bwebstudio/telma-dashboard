'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dictionary } from '@/content'
import { locales, localeNames } from '@/content'
import { CRM_COUNTRIES } from '@/lib/crm/types'
import { createRep, type CrmState } from '@/lib/actions/crm'

// Creating a rep creates a normal Supabase Auth account with the 'comercial'
// role. There is no public sign up and no second login system: the new rep
// signs in at /login like everybody else and lands on their own HOJE.
function Submit({ dict }: { dict: Dictionary }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary min-h-[3rem]" disabled={pending}>
      {pending ? dict.crm.team.creating : dict.crm.team.create}
    </button>
  )
}

export function RepForm({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState<CrmState, FormData>(createRep, {})
  const t = dict.crm.team

  return (
    <details className="card px-4 py-3 sm:px-6 sm:py-5">
      <summary className="cursor-pointer text-base font-medium text-ink-soft">{t.newRep}</summary>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <p className="text-base text-ink-soft">{t.newRepHelp}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="full_name" label={t.fullName}>
            <input id="full_name" name="full_name" required className="field-input min-h-[3rem]" />
          </Field>
          <Field id="email" label={t.email}>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="field-input min-h-[3rem]"
            />
          </Field>
          <Field id="password" label={t.tempPassword}>
            <input
              id="password"
              name="password"
              type="text"
              required
              minLength={8}
              className="field-input min-h-[3rem]"
            />
          </Field>
          <Field id="country" label={t.country}>
            <select id="country" name="country" className="field-input min-h-[3rem]">
              {CRM_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {dict.crm.country[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="territory" label={t.territory}>
            <input id="territory" name="territory" className="field-input min-h-[3rem]" />
          </Field>
          <Field id="locale" label={t.language}>
            <select id="locale" name="locale" className="field-input min-h-[3rem]">
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeNames[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rep_role" label={t.repRole}>
            <select id="rep_role" name="rep_role" className="field-input min-h-[3rem]">
              <option value="comercial">{dict.crm.nav.section}</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>

        {state.error && (
          <p role="alert" className="text-base font-medium text-danger">
            {dict.common.errorGeneric}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-base font-medium text-ok">
            {dict.common.saved}
          </p>
        )}

        <Submit dict={dict} />
      </form>
    </details>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
    </div>
  )
}
