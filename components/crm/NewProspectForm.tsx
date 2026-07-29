'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import type { Dictionary } from '@/content'
import {
  CRM_CONTACT_ROLES,
  CRM_COUNTRIES,
  CRM_ORIGINS,
  CRM_SPECIALTIES,
  type CrmRep,
} from '@/lib/crm/types'
import { parseProspectText } from '@/lib/crm/parse'
import { createProspect, type CrmState } from '@/lib/actions/crm'
import type { DuplicateHit } from '@/app/api/crm/duplicates/route'

// Adding a clinic found on the street. Name is the only required field;
// everything else is either optional or filled in from a pasted message.

const EMPTY = {
  name: '',
  phone: '',
  zone: '',
  address: '',
  website: '',
  specialty: 'other',
  country: 'PT',
  origin: 'cold',
  origin_note: '',
  contact_name: '',
  contact_role: 'other',
  contact_phone: '',
  contact_notes: '',
  rest: '',
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-paper transition-colors hover:bg-accent-dark disabled:opacity-60 sm:w-auto sm:px-10"
    >
      {pending ? busy : label}
    </button>
  )
}

export function NewProspectForm({
  dict,
  reps,
  isAdmin,
  defaultCountry,
}: {
  dict: Dictionary
  reps: CrmRep[]
  isAdmin: boolean
  defaultCountry: string
}) {
  const t = dict.crm
  const [state, action] = useActionState<CrmState, FormData>(createProspect, {})
  const [values, setValues] = useState({ ...EMPTY, country: defaultCountry })
  const [paste, setPaste] = useState('')
  const [hits, setHits] = useState<DuplicateHit[]>([])
  const [checking, setChecking] = useState(false)

  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }))

  function splitPaste() {
    const parsed = parseProspectText(paste)
    setValues((v) => ({
      ...v,
      name: parsed.name || v.name,
      phone: parsed.phone || v.phone,
      zone: parsed.zone || v.zone,
      address: parsed.address || v.address,
      website: parsed.website || v.website,
      specialty: parsed.specialty || v.specialty,
      contact_name: parsed.contactName || v.contact_name,
      contact_role: parsed.contactRole || v.contact_role,
      // Anything the parser could not place is kept as the first note instead
      // of being silently dropped.
      rest: parsed.rest || v.rest,
    }))
  }

  // Overlap check, debounced so it does not fire on every keystroke.
  useEffect(() => {
    const name = values.name.trim()
    const phone = values.phone.trim()
    if (name.length < 3 && phone.replace(/\D/g, '').length < 6) {
      setHits([])
      return
    }
    let cancelled = false
    setChecking(true)
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ name, phone })
        const res = await fetch(`/api/crm/duplicates?${params}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (!cancelled) setHits(Array.isArray(data?.hits) ? data.hits : [])
      } catch {
        if (!cancelled) setHits([])
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearInterval(timer)
    }
  }, [values.name, values.phone])

  return (
    <form action={action} className="flex flex-col gap-5 pb-28 md:pb-0">
      <section className="card p-4 sm:p-5">
        <h2 className="label-caps mb-1">{t.novo.pasteTitle}</h2>
        <p className="mb-3 text-base text-ink-soft">{t.novo.pasteHelp}</p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder={t.novo.pastePlaceholder}
          aria-label={t.novo.pasteTitle}
          className="w-full rounded-2xl border border-line-strong bg-paper px-3.5 py-3 text-base text-ink placeholder:text-ink-mute focus:border-accent"
        />
        <button
          type="button"
          onClick={splitPaste}
          disabled={!paste.trim()}
          className="btn-secondary mt-2 min-h-[3rem] disabled:opacity-40"
        >
          {t.novo.pasteAction}
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <Text
          name="name"
          label={t.novo.name}
          value={values.name}
          onChange={(v) => set('name', v)}
          required
          autoFocus
        />
        <Text
          name="phone"
          label={t.novo.phone}
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(v) => set('phone', v)}
        />
        <Text
          name="zone"
          label={t.novo.zone}
          value={values.zone}
          onChange={(v) => set('zone', v)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            name="specialty"
            label={t.novo.specialty}
            value={values.specialty}
            onChange={(v) => set('specialty', v)}
            options={CRM_SPECIALTIES.map((s) => [s, t.specialty[s]])}
          />
          <Select
            name="country"
            label={t.novo.country}
            value={values.country}
            onChange={(v) => set('country', v)}
            options={CRM_COUNTRIES.map((c) => [c, t.country[c]])}
          />
        </div>
      </section>

      {(hits.length > 0 || checking) && (
        <section
          className="rounded-2xl border border-warn/45 bg-warn-soft p-4"
          role="status"
          aria-live="polite"
        >
          <p className="font-serif text-lg font-semibold text-ink">
            {checking && hits.length === 0 ? t.novo.dupChecking : t.novo.dupTitle}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`} className="text-base text-ink-soft">
                <span className="font-medium text-ink">{h.name}</span>
                {h.zone ? ` · ${h.zone}` : ''}
                {h.phone ? ` · ${h.phone}` : ''}
                <span className="ml-2 badge bg-paper text-ink-soft">
                  {h.kind === 'client' ? t.novo.dupClient : t.novo.dupProspect}
                </span>
                {h.kind === 'prospect' && (
                  <>
                    <span className="ml-2 text-sm">
                      {t.novo.dupAssigned} {h.rep_name ?? t.novo.dupUnassigned}
                    </span>
                    <Link
                      href={`/crm/prospetos/${h.id}`}
                      className="ml-2 text-sm font-medium text-accent underline"
                    >
                      {t.novo.dupOpen}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-2xl border border-line bg-paper-2 px-4 py-3">
        <summary className="cursor-pointer text-base font-medium text-ink-soft">
          {dict.common.optional}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <Text
            name="address"
            label={t.novo.address}
            value={values.address}
            onChange={(v) => set('address', v)}
          />
          <Text
            name="website"
            label={t.novo.website}
            value={values.website}
            onChange={(v) => set('website', v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              name="origin"
              label={t.novo.origin}
              value={values.origin}
              onChange={(v) => set('origin', v)}
              options={CRM_ORIGINS.map((o) => [o, t.origin[o]])}
            />
            <Text
              name="origin_note"
              label={t.novo.originNote}
              placeholder={t.novo.originNotePlaceholder}
              value={values.origin_note}
              onChange={(v) => set('origin_note', v)}
            />
          </div>

          {isAdmin && (
            <Select
              name="rep_id"
              label={t.list.filterRep}
              value=""
              onChange={() => {}}
              uncontrolled
              options={[
                ['none', t.list.unassigned],
                ...reps.filter((r) => r.active).map((r) => [r.id, r.full_name] as [string, string]),
              ]}
            />
          )}

          <fieldset className="border-t border-line pt-4">
            <legend className="label-caps">{t.novo.contactTitle}</legend>
            <div className="mt-3 flex flex-col gap-4">
              <Text
                name="contact_name"
                label={t.detail.contactName}
                value={values.contact_name}
                onChange={(v) => set('contact_name', v)}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  name="contact_role"
                  label={t.detail.contactRole}
                  value={values.contact_role}
                  onChange={(v) => set('contact_role', v)}
                  options={CRM_CONTACT_ROLES.map((r) => [r, t.contactRole[r]])}
                />
                <Text
                  name="contact_phone"
                  label={t.detail.contactPhone}
                  type="tel"
                  value={values.contact_phone}
                  onChange={(v) => set('contact_phone', v)}
                />
              </div>
              <Text
                name="contact_notes"
                label={t.detail.contactNotes}
                value={values.contact_notes}
                onChange={(v) => set('contact_notes', v)}
              />
            </div>
          </fieldset>
        </div>
      </details>

      <input type="hidden" name="rest" value={values.rest} />

      {state.error && (
        <p role="alert" className="text-base font-medium text-danger">
          {dict.common.errorGeneric}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[3.5rem] z-20 border-t border-line bg-paper px-4 py-3 md:static md:border-0 md:bg-transparent md:px-0 md:py-0">
        <Submit
          label={hits.length > 0 ? t.novo.dupCreateAnyway : t.novo.create}
          busy={t.novo.creating}
        />
      </div>
    </form>
  )
}

function Text({
  name,
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  required,
  autoFocus,
}: {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'tel' | 'text'
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-input min-h-[3rem]"
      />
    </div>
  )
}

function Select({
  name,
  label,
  value,
  onChange,
  options,
  uncontrolled,
}: {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  uncontrolled?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <select
        id={name}
        name={name}
        {...(uncontrolled
          ? { defaultValue: value }
          : { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) })}
        className="field-input min-h-[3rem]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}
