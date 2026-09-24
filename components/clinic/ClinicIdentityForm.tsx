'use client'

import { useState, useTransition } from 'react'
import { updateClinicProfile } from '@/lib/actions/clinic-settings'
import { Text, Select } from '@/components/onboarding/FormSections'
import { COUNTRIES, COUNTRY_LABEL, countryOfRegion, regionsFor } from '@/lib/onboarding/catalog'
import { copyFor } from '@/lib/onboarding/copy'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * Who the clinic is, and where its number comes from.
 *
 * These three questions used to sit on the Telma screen, among the ones about
 * how she answers, where they were a third of the fields and none of them said
 * anything about behaviour. They belong beside the name and the plan.
 *
 * It sends the whole profile back, not the three fields: the save action
 * validates the sign-up's steps as wholes, and a payload missing what it was
 * never given fails on fields nobody touched. The rest travels unchanged.
 *
 * The country is not a column. It is read off the region, and it is here so
 * that changing country offers the right list of regions; changing it clears
 * the region on purpose, because a Portuguese district is not a valid answer
 * for a clinic in Spain and would buy a number with the wrong dial code.
 */

const COPY = {
  pt: { save: 'Guardar', saving: 'A guardar...', saved: 'Guardado', failed: 'Não foi possível guardar.' },
  es: { save: 'Guardar', saving: 'Guardando...', saved: 'Guardado', failed: 'No se ha podido guardar.' },
} as const

export function ClinicIdentityForm({
  profile,
  locale,
  readOnly,
}: {
  profile: Record<string, unknown>
  locale: OnboardingLocale
  readOnly: boolean
}) {
  const t = copyFor(locale)
  const c = COPY[locale] ?? COPY.pt
  const [values, setValues] = useState<Record<string, unknown>>(profile)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const region = (values.region as string) ?? ''
  const country = (values.country as 'PT' | 'ES') ?? (region ? countryOfRegion(region) : locale === 'es' ? 'ES' : 'PT')

  const set = (patch: Record<string, unknown>) => {
    setValues((v) => ({ ...v, ...patch }))
    setDirty(true)
    setSaved(false)
  }

  function save() {
    setErrors({})
    startTransition(async () => {
      const r = await updateClinicProfile(values, locale)
      if (r.ok) {
        setDirty(false)
        setSaved(true)
        return
      }
      setErrors(r.errors)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Text
        name="email"
        label={t.email}
        hint={t.emailHelp}
        error={errors.email}
        value={(values.email as string) ?? ''}
        onChange={(v) => set({ email: v })}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="geral@clinicaserrano.pt"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          name="country"
          label={t.country}
          error={errors.country}
          value={country}
          onChange={(v) => set({ country: v, region: '', area_region: '' })}
        >
          {COUNTRIES.map((x) => (
            <option key={x} value={x}>
              {COUNTRY_LABEL[locale][x]}
            </option>
          ))}
        </Select>

        <Select
          name="region"
          label={t.region}
          error={errors.region}
          value={region}
          onChange={(v) => set({ region: v, area_region: values.area_region || v })}
        >
          <option value="">{t.choose}</option>
          {regionsFor(country).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {errors._form && (
        <p role="alert" className="text-sm font-medium text-danger">
          {c.failed}
        </p>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="btn-primary min-h-0 px-4 py-2 text-sm disabled:opacity-40"
          >
            {pending ? c.saving : c.save}
          </button>
          {saved && !dirty && <span className="text-sm text-ink-mute">{c.saved}</span>}
        </div>
      )}
    </div>
  )
}
