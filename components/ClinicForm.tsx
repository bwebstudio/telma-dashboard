'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dictionary } from '@/content'
import type { PlanType } from '@/lib/types'
import { createClinic, type CreateState } from '@/lib/actions/clinics'

const PLANS: PlanType[] = ['essencial', 'clinica', 'rede', 'personalizado']

function Submit({ dict }: { dict: Dictionary }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? dict.interno.creating : dict.interno.createClinic}
    </button>
  )
}

export function ClinicForm({ dict }: { dict: Dictionary }) {
  const [state, action] = useActionState<CreateState, FormData>(createClinic, {})
  const t = dict.interno

  return (
    <form action={action} className="flex flex-col gap-8">
      <fieldset className="card p-6">
        <legend className="label-caps px-1">{t.fichaData}</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Text name="name" label={t.fieldClinicName} required />
          <Text name="phone" label={t.fieldPhone} />
          <Text name="address" label={t.fieldAddress} />
          <Text name="contact_email" label={t.fieldContactEmail} type="email" />
          <div>
            <label htmlFor="plan" className="field-label">
              {t.fieldPlan}
            </label>
            <select id="plan" name="plan" defaultValue="essencial" className="field-input">
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {dict.plans[p]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 pt-8">
            <input type="checkbox" name="addon" className="h-5 w-5 accent-accent" />
            <span className="text-base text-ink">{t.fieldAddon}</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="card p-6">
        <legend className="label-caps px-1">{t.fieldUserEmail}</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Text name="user_name" label={t.fieldUserName} />
          <Text name="user_email" label={t.fieldUserEmail} type="email" required />
          <Text name="password" label={t.fieldTempPassword} type="text" required />
        </div>
        <p className="mt-4 text-sm text-ink-mute">{t.defaultSlotsNote}</p>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}

      <div>
        <Submit dict={dict} />
      </div>
    </form>
  )
}

function Text({
  name,
  label,
  type = 'text',
  required,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      <input id={name} name={name} type={type} required={required} className="field-input" />
    </div>
  )
}
