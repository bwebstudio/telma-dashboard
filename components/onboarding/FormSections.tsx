'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  COUNTRIES,
  COUNTRY_LABEL,
  countryOfRegion,
  OPERATORS_BY_COUNTRY,
  PHONE_EXAMPLE,
  regionsFor,
  servicesFor,
  specialtyLabel,
  SPECIALTIES,
  type Country,
  type Specialty,
} from '@/lib/onboarding/catalog'
import { copyFor } from '@/lib/onboarding/copy'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

import type { LanguageOption } from '@/lib/onboarding/languages'
import { PromptPreview } from './PromptPreview'
import type { PlanType } from '@/lib/types'

/** One row of the price list, as the last step draws it. Filled by
 *  `signupPlans()` from the `plans` table, or from lib/plans in demo mode. */
export interface SignupPlan {
  id: PlanType
  name: string
  description: string | null
  monthly: number | null
  annual: number | null
  minutes: number | null
  locations: number
  /** How many languages it includes. Null is unlimited. */
  maxLanguages: number | null
}

/**
 * The six steps, as six components over one shared value bag.
 *
 * Every input is controlled and every one of them writes into the same object,
 * because that object is exactly what gets validated and exactly what gets
 * stored. A per-step local state would have to be gathered back up at the end,
 * and gathering is where a field quietly goes missing.
 *
 * `errors` is keyed the way zod paths are joined in wizard-schema.ts, so
 * `weekdays.close` finds the closing time of the weekday row. Nothing here
 * decides what is wrong; it only draws what the schema said.
 */

export type Values = Record<string, any>

export interface StepProps {
  values: Values
  set: (patch: Values) => void
  errors: Record<string, string>
  locale: OnboardingLocale
}

/**
 * Which country the clinic is in.
 *
 * Derived from the region rather than stored beside it, because a region id is
 * unique across both countries and therefore already says which one it is. Two
 * stored fields could disagree; one cannot. Before a region is picked it falls
 * back to the language, which is the best guess available: somebody reading the
 * form in Spanish is far more likely to be in Spain than in Portugal.
 */
function countryOf(values: Values, locale: OnboardingLocale): Country {
  if (values.country) return values.country as Country
  if (values.region) return countryOfRegion(values.region)
  return locale === 'es' ? 'ES' : 'PT'
}

// Shared field primitives ----------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {/* The hint disappears once there is an error. Two lines of small grey
          text under one input is where people stop reading either. */}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-mute">{hint}</p>
      ) : null}
    </div>
  )
}

function inputClass(error?: string): string {
  return error ? 'field-input border-danger/60' : 'field-input'
}

function Text({
  name,
  label,
  hint,
  error,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint} error={error}>
      <input
        id={name}
        name={name}
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={inputClass(error)}
      />
    </Field>
  )
}

function Select({
  name,
  label,
  hint,
  error,
  value,
  onChange,
  children,
}: {
  name: string
  label: string
  hint?: string
  error?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint} error={error}>
      <select
        id={name}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={inputClass(error)}
      >
        {children}
      </select>
    </Field>
  )
}

/**
 * A choice you make by clicking the whole thing, not by hitting a 16px circle.
 *
 * Used for the plan, the voice and the two ways of getting a number. In each
 * case the option carries a paragraph of its own, and a paragraph next to a
 * radio button that is not part of the target is a paragraph people click on
 * and nothing happens.
 */
function OptionCard({
  name,
  value,
  checked,
  onSelect,
  title,
  aside,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onSelect: () => void
  title: string
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <label
      className={[
        'flex cursor-pointer gap-3.5 rounded-card border p-4 transition-all duration-fast ease-calm',
        checked
          ? 'border-brand bg-brand-wash shadow-1'
          : 'border-line bg-surface hover:border-ink/20',
      ].join(' ')}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-4 w-4 shrink-0 accent-brand"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-base font-medium text-ink">{title}</span>
          {aside}
        </span>
        {children && <span className="mt-1 block text-sm text-ink-soft">{children}</span>}
      </span>
    </label>
  )
}

function Checkbox({
  name,
  checked,
  onChange,
  children,
  error,
}: {
  name: string
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  error?: string
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name={name}
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="text-base text-ink">{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

// Step 1: the clinic ---------------------------------------------------------

export function ClinicStep({ values, set, errors, locale }: StepProps) {
  const t = copyFor(locale)
  const country = countryOf(values, locale)
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Text
          name="clinic_name"
          label={t.clinicName}
          hint={t.clinicNameHelp}
          error={errors.clinic_name}
          value={values.clinic_name}
          onChange={(v) => set({ clinic_name: v })}
          autoComplete="organization"
          placeholder="Clínica Serrano"
        />
      </div>

      <Text
        name="email"
        label={t.email}
        hint={t.emailHelp}
        error={errors.email}
        value={values.email}
        onChange={(v) => set({ email: v })}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="geral@clinicaserrano.pt"
      />

      <Text
        name="phone"
        label={t.phone}
        hint={t.phoneHelp}
        error={errors.phone}
        value={values.phone}
        onChange={(v) => set({ phone: v })}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={PHONE_EXAMPLE[country]}
      />

      <div className="sm:col-span-2">
        <Text
          name="address"
          label={t.address}
          hint={t.addressHelp}
          error={errors.address}
          value={values.address}
          onChange={(v) => set({ address: v })}
          autoComplete="street-address"
        />
      </div>

      <Select
        name="country"
        label={t.country}
        error={errors.country}
        value={country}
        onChange={(v) =>
          // Changing country empties the region: a Portuguese district is not a
          // valid answer for a clinic in Spain, and leaving it selected would
          // buy a number with the wrong dial code.
          set({ country: v, region: '', area_region: '' })
        }
      >
        {COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {COUNTRY_LABEL[locale][c]}
          </option>
        ))}
      </Select>

      <Select
        name="specialty"
        label={t.specialty}
        error={errors.specialty}
        value={values.specialty}
        onChange={(v) =>
          // Changing the specialty empties the services: the list on step 3 is
          // per specialty, and keeping "implantes" selected on a veterinary
          // clinic would pass validation and be wrong.
          set({ specialty: v, services: [] })
        }
      >
        <option value="">{t.choose}</option>
        {SPECIALTIES.map((s) => (
          <option key={s} value={s}>
            {specialtyLabel(s, locale)}
          </option>
        ))}
      </Select>

      <Select
        name="region"
        label={t.region}
        error={errors.region}
        value={values.region}
        onChange={(v) =>
          // The new number's area follows the clinic's region. Almost every
          // clinic wants a number where it is, and step 6 can still change it.
          // Without this the select there *showed* the region and stored
          // nothing, so leaving the default was the one answer that failed.
          set({ region: v, area_region: values.area_region || v })
        }
      >
        <option value="">{t.choose}</option>
        {regionsFor(country).map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

// Step 2: opening hours ------------------------------------------------------

function DayRow({
  group,
  label,
  values,
  set,
  errors,
  locale,
}: StepProps & { group: 'weekdays' | 'saturday' | 'sunday'; label: string }) {
  const t = copyFor(locale)
  const day = values[group] ?? {}
  const patch = (p: Values) => set({ [group]: { ...day, ...p } })

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base font-medium text-ink">{label}</span>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={Boolean(day.closed)}
            onChange={(e) => patch({ closed: e.target.checked })}
            className="h-4 w-4 accent-brand"
          />
          {t.closed}
        </label>
      </div>

      {!day.closed && (
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor={`${group}-open`} className="field-label">
              {t.opens}
            </label>
            <input
              id={`${group}-open`}
              type="time"
              value={day.open ?? ''}
              onChange={(e) => patch({ open: e.target.value })}
              className={`${inputClass(errors[`${group}.open`])} w-32`}
            />
          </div>
          <div>
            <label htmlFor={`${group}-close`} className="field-label">
              {t.closes}
            </label>
            <input
              id={`${group}-close`}
              type="time"
              value={day.close ?? ''}
              onChange={(e) => patch({ close: e.target.value })}
              className={`${inputClass(errors[`${group}.close`])} w-32`}
            />
          </div>
        </div>
      )}

      {(errors[`${group}.close`] || errors[group]) && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {errors[`${group}.close`] ?? errors[group]}
        </p>
      )}
    </div>
  )
}

export function HoursStep({ values, set, errors, locale }: StepProps) {
  const t = copyFor(locale)
  const pause = values.pause ?? {}

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {(['weekdays', 'saturday', 'sunday'] as const).map((g) => (
          <DayRow
            key={g}
            group={g}
            label={t[g]}
            values={values}
            set={set}
            errors={errors}
            locale={locale}
          />
        ))}
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(pause.enabled)}
            onChange={(e) => set({ pause: { ...pause, enabled: e.target.checked } })}
            className="h-5 w-5 accent-brand"
          />
          <span className="text-base font-medium text-ink">{t.pause}</span>
        </label>
        <p className="mt-1.5 pl-8 text-sm text-ink-mute">{t.pauseHelp}</p>

        {pause.enabled && (
          <div className="mt-3 flex flex-wrap items-end gap-4 pl-8">
            <div>
              <label htmlFor="pause-start" className="field-label">
                Início
              </label>
              <input
                id="pause-start"
                type="time"
                value={pause.start ?? ''}
                onChange={(e) => set({ pause: { ...pause, start: e.target.value } })}
                className={`${inputClass(errors['pause.start'])} w-32`}
              />
            </div>
            <div>
              <label htmlFor="pause-end" className="field-label">
                Fim
              </label>
              <input
                id="pause-end"
                type="time"
                value={pause.end ?? ''}
                onChange={(e) => set({ pause: { ...pause, end: e.target.value } })}
                className={`${inputClass(errors['pause.end'])} w-32`}
              />
            </div>
          </div>
        )}
        {errors['pause.end'] && (
          <p role="alert" className="mt-2 pl-8 text-sm font-medium text-danger">
            {errors['pause.end']}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          name="appointment_duration_minutes"
          label={t.duration}
          hint={t.durationHelp}
          error={errors.appointment_duration_minutes}
          value={String(values.appointment_duration_minutes ?? 30)}
          onChange={(v) => set({ appointment_duration_minutes: Number(v) })}
        >
          {[15, 20, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>
              {m} {t.minutes}
            </option>
          ))}
        </Select>

        <Select
          name="min_interval_minutes"
          label={t.interval}
          hint={t.intervalHelp}
          error={errors.min_interval_minutes}
          value={String(values.min_interval_minutes ?? 30)}
          onChange={(v) => set({ min_interval_minutes: Number(v) })}
        >
          {[15, 20, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} {t.minutes}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}

// Step 3: services -----------------------------------------------------------

export function ServicesStep({ values, set, errors, locale }: StepProps) {
  const t = copyFor(locale)
  const specialty = (values.specialty as Specialty) || 'outra'
  const options = servicesFor(specialty, locale)
  const chosen: string[] = values.services ?? []

  const toggle = (id: string) =>
    set({
      services: chosen.includes(id) ? chosen.filter((s) => s !== id) : [...chosen, id],
    })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-ink-mute">{t.servicesHelp}</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {options.map((service) => {
            const on = chosen.includes(service.id)
            return (
              <label
                key={service.id}
                className={[
                  'flex cursor-pointer items-center gap-3 rounded-card border p-3.5 transition-all duration-fast ease-calm',
                  on
                    ? 'border-brand bg-brand-wash'
                    : 'border-line bg-surface hover:border-ink/20',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(service.id)}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
                <span className="text-base text-ink">{service.label}</span>
              </label>
            )
          })}
        </div>
        {errors.services && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {errors.services}
          </p>
        )}
      </div>

      <Field
        label={t.customServices}
        htmlFor="custom_services"
        hint={t.customServicesHelp}
        error={errors.custom_services}
      >
        <textarea
          id="custom_services"
          name="custom_services"
          rows={3}
          value={values.custom_services ?? ''}
          onChange={(e) => set({ custom_services: e.target.value })}
          className={`${inputClass(errors.custom_services)} py-2.5`}
        />
      </Field>

      {/* Prices are optional on purpose. Some clinics quote on the phone and
          some refuse on principle, and left empty the prompt tells Telma not to
          discuss them at all rather than leaving her to improvise. */}
      <Field
        label={t.priceInfo}
        htmlFor="price_info"
        hint={t.priceInfoHelp}
        error={errors.price_info}
      >
        <textarea
          id="price_info"
          name="price_info"
          rows={3}
          placeholder={t.priceInfoPlaceholder}
          value={values.price_info ?? ''}
          onChange={(e) => set({ price_info: e.target.value })}
          className={`${inputClass(errors.price_info)} py-2.5`}
        />
      </Field>
    </div>
  )
}

// Step 4: the voice ----------------------------------------------------------

function euros(n: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}


export function TelmaStep({
  values,
  set,
  errors,
  locale,
  languages,
  maxLanguages,
}: StepProps & {
  languages: LanguageOption[]
  /** The ceiling of the most generous plan on sale. The plan itself is chosen
   *  two steps later, so this caps the picker and step 6 marks what fits. */
  maxLanguages: number | null
}) {
  const t = copyFor(locale)
  const chosen: string[] = values.selected_languages ?? []
  const atMax = maxLanguages !== null && chosen.length >= maxLanguages
  const greeting: string = values.greeting_language ?? chosen[0] ?? ''
  const fallback: string = values.fallback_policy ?? 'message'

  function toggle(code: string) {
    const next = chosen.includes(code)
      ? chosen.filter((c) => c !== code)
      : [...chosen, code]
    // The greeting has to be one of the chosen languages. Dropping the one
    // Telma opens in silently leaves her greeting in a language the clinic just
    // said it does not speak, so it moves to whatever is left.
    set({
      selected_languages: next,
      greeting_language: next.includes(greeting) ? greeting : (next[0] ?? ''),
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="field-label">{t.languages}</p>
          {maxLanguages !== null && (
            <p className="text-sm text-ink-mute">
              {t.languagesCount
                .replace('{n}', String(chosen.length))
                .replace('{max}', String(maxLanguages))}
            </p>
          )}
        </div>
        <p className="mb-3 text-sm text-ink-mute">{t.languagesHelp}</p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {languages.map((l) => {
            const on = chosen.includes(l.code)
            const soon = l.status !== 'available'
            // Disabled for two different reasons, and the reason is written
            // next to it: a checkbox that will not tick and says nothing is
            // read as broken. No language is compulsory: which ones a clinic
            // speaks is its own decision, not one deduced from its address.
            const disabled = soon || (!on && atMax)
            return (
              <label
                key={l.code}
                aria-disabled={disabled}
                className={[
                  'flex items-center justify-between gap-3 rounded-card border p-3.5 transition-all duration-fast ease-calm',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  on
                    ? 'border-brand bg-brand-wash'
                    : soon || (!on && atMax)
                      ? 'border-line bg-surface-sunken opacity-60'
                      : 'border-line bg-surface hover:border-ink/20',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => toggle(l.code)}
                    className="h-5 w-5 shrink-0 accent-brand"
                  />
                  <span className="truncate text-base text-ink">{l.name}</span>
                </span>
                {soon && <span className="shrink-0 text-sm text-ink-mute">{t.languagesSoon}</span>}
              </label>
            )
          })}
        </div>

        {atMax && <p className="mt-2 text-sm text-ink-mute">{t.languagesFull}</p>}
        {errors.selected_languages && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {errors.selected_languages}
          </p>
        )}
      </div>

      {/* Which of them Telma opens in. Only meaningful once more than one is
          chosen, so it stays out of the way until then. */}
      {chosen.length > 1 && (
        <Select
          name="greeting_language"
          label={t.greetingLanguage}
          hint={t.greetingLanguageHelp}
          error={errors.greeting_language}
          value={greeting}
          onChange={(v) => set({ greeting_language: v })}
        >
          {languages
            .filter((l) => chosen.includes(l.code))
            .map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
        </Select>
      )}

      <div className="rule" />

      {/* How to address people. Not a stylistic preference: a dental clinic in
          Porto and an aesthetic clinic in Barcelona differ on this, and getting
          it wrong is the first thing a patient notices. */}
      <div>
        <p className="field-label">{t.formality}</p>
        <p className="mb-3 text-sm text-ink-mute">{t.formalityHelp}</p>
        <div className="flex flex-wrap gap-2.5">
          {(['formal', 'informal'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ formality: f })}
              aria-pressed={(values.formality ?? 'formal') === f}
              className={[
                'min-h-[2.75rem] rounded-pill border px-5 text-base transition-all duration-fast ease-calm',
                (values.formality ?? 'formal') === f
                  ? 'border-brand bg-brand text-white'
                  : 'border-line-strong bg-surface text-ink hover:border-ink/25',
              ].join(' ')}
            >
              {f === 'formal' ? t.formalityFormal : t.formalityInformal}
            </button>
          ))}
        </div>
      </div>

      {/* What happens when Telma cannot help. Three honest answers. */}
      <div className="flex flex-col gap-2.5">
        <div>
          <p className="field-label">{t.fallback}</p>
          <p className="text-sm text-ink-mute">{t.fallbackHelp}</p>
        </div>
        {(['transfer', 'message', 'callback'] as const).map((p) => (
          <OptionCard
            key={p}
            name="fallback_policy"
            value={p}
            checked={fallback === p}
            onSelect={() => set({ fallback_policy: p })}
            title={
              p === 'transfer'
                ? t.fallbackTransfer
                : p === 'message'
                  ? t.fallbackMessage
                  : t.fallbackCallback
            }
          >
            {p === 'transfer'
              ? t.fallbackTransferHelp
              : p === 'message'
                ? t.fallbackMessageHelp
                : t.fallbackCallbackHelp}
          </OptionCard>
        ))}
        {fallback === 'transfer' && (
          <Text
            name="fallback_number"
            label={t.fallbackNumber}
            error={errors.fallback_number}
            value={values.fallback_number}
            onChange={(v) => set({ fallback_number: v })}
            type="tel"
            inputMode="tel"
          />
        )}
      </div>

      {/* Emergencies. Its own block, above the catch-all, because it is a
          different path from "I do not know": one takes a message, the other
          interrupts. The landing promises this in writing. */}
      <div className="rounded-card border border-danger/25 bg-danger-soft/40 p-4">
        <p className="field-label">{t.emergency}</p>
        <p className="mb-4 text-sm text-ink-soft">{t.emergencyHelp}</p>
        <div className="flex flex-col gap-5">
          <Text
            name="emergency_number"
            label={t.emergencyNumber}
            hint={t.emergencyNumberHelp}
            error={errors.emergency_number}
            value={values.emergency_number}
            onChange={(v) => set({ emergency_number: v })}
            type="tel"
            inputMode="tel"
          />
          <Field
            label={t.emergencyProtocol}
            htmlFor="emergency_protocol"
            hint={t.emergencyProtocolHelp}
            error={errors.emergency_protocol}
          >
            <textarea
              id="emergency_protocol"
              name="emergency_protocol"
              rows={2}
              placeholder={t.emergencyProtocolPlaceholder}
              value={values.emergency_protocol ?? ''}
              onChange={(e) => set({ emergency_protocol: e.target.value })}
              className={`${inputClass(errors.emergency_protocol)} py-2.5`}
            />
          </Field>
          {!values.emergency_number && (
            <p className="text-sm text-ink-mute">{t.emergencyNone}</p>
          )}

          {/* Consent to be rung at night, asked out loud rather than assumed.
              Unticked is the answer a clinic gets by not reading this, and it is
              the safe one: Telma gives the emergency number and lets everybody
              sleep. The two fields below only appear once somebody has said yes,
              because until then they are answers to a question nobody asked. */}
          <div className="border-t border-danger/20 pt-4">
            <p className="field-label">{t.afterHours}</p>
            <p className="mb-3 text-sm text-ink-soft">{t.afterHoursHelp}</p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="after_hours_transfer"
                checked={values.after_hours_transfer === true}
                onChange={(e) => set({ after_hours_transfer: e.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 accent-ink"
              />
              <span className="text-base text-ink">{t.afterHoursOn}</span>
            </label>

            {values.after_hours_transfer !== true ? (
              <p className="mt-3 text-sm text-ink-mute">{t.afterHoursOff}</p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <Text
                  name="after_hours_number"
                  label={t.afterHoursNumber}
                  hint={t.afterHoursNumberHelp}
                  error={errors.after_hours_number}
                  value={values.after_hours_number}
                  onChange={(v) => set({ after_hours_number: v })}
                  type="tel"
                  inputMode="tel"
                />
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="after_hours_patients_only"
                    checked={values.after_hours_patients_only !== false}
                    onChange={(e) => set({ after_hours_patients_only: e.target.checked })}
                    className="mt-1 h-4 w-4 shrink-0 accent-ink"
                  />
                  <span className="text-base text-ink">
                    {t.afterHoursPatientsOnly}
                    <span className="mt-0.5 block text-sm text-ink-mute">
                      {t.afterHoursPatientsOnlyHelp}
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The catch-all. Parking, which insurers are accepted, the entrance
          being round the back, the dentist away on Thursdays. Read into the
          prompt verbatim, which is why the placeholder shows the shape rather
          than describing it. */}
      <Field
        label={t.briefing}
        htmlFor="briefing"
        hint={t.briefingHelp}
        error={errors.briefing}
      >
        <textarea
          id="briefing"
          name="briefing"
          rows={4}
          placeholder={t.briefingPlaceholder}
          value={values.briefing ?? ''}
          onChange={(e) => set({ briefing: e.target.value })}
          className={`${inputClass(errors.briefing)} py-2.5`}
        />
      </Field>

      {/* Last, and not first. Everything above is a question; this is the
          answer, and it only means anything once there is something to show. */}
      <PromptPreview values={values} locale={locale} />
    </div>
  )
}

// Step 5: the number ---------------------------------------------------------

export function NumberStep({
  values,
  set,
  errors,
  locale,
  demo,
}: StepProps & { demo: boolean }) {
  const t = copyFor(locale)

  // A draft saved before the line above existed arrives here with a region and
  // no area. Fill it once, so what the select shows is what it holds.
  useEffect(() => {
    if (!values.area_region && values.region) set({ area_region: values.region })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.region])
  const country = countryOf(values, locale)
  const option = values.phone_option ?? 'new'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <OptionCard
          name="phone_option"
          value="keep"
          checked={option === 'keep'}
          onSelect={() => set({ phone_option: 'keep' })}
          title={t.keepNumber}
        >
          {t.keepNumberHelp}
        </OptionCard>

        <OptionCard
          name="phone_option"
          value="new"
          checked={option === 'new'}
          onSelect={() => set({ phone_option: 'new' })}
          title={t.newNumber}
        >
          {t.newNumberHelp}
        </OptionCard>
      </div>

      {option === 'keep' ? (
        <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Text
              name="current_number"
              label={t.currentNumber}
              error={errors.current_number}
              value={values.current_number}
              onChange={(v) => set({ current_number: v })}
              type="tel"
              inputMode="tel"
              placeholder={PHONE_EXAMPLE[country]}
            />
            <Select
              name="operator"
              label={t.operator}
              error={errors.operator}
              value={values.operator}
              onChange={(v) => set({ operator: v })}
            >
              <option value="">{t.choose}</option>
              {OPERATORS_BY_COUNTRY[country].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-sm text-ink-mute">{t.portingNote}</p>
        </div>
      ) : (
        <div className="rounded-card border border-line bg-surface p-4">
          <Select
            name="area_region"
            label={t.areaRegion}
            error={errors.area_region}
            value={values.area_region ?? ''}
            onChange={(v) => set({ area_region: v })}
          >
            <option value="">{t.choose}</option>
            {regionsFor(country).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} ({r.areaCode})
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="rule" />

      <Checkbox
        name="terms"
        checked={values.terms}
        onChange={(v) => set({ terms: v })}
        error={errors.terms}
      >
        {t.terms}
      </Checkbox>

      <p className="text-sm text-ink-mute">{demo ? t.paymentNoteDemo : t.paymentNote}</p>
    </div>
  )
}

// Step 6: the plan -----------------------------------------------------------

export function PlanStep({
  values,
  set,
  errors,
  plans,
  locale,
}: StepProps & { plans: SignupPlan[] }) {
  const t = copyFor(locale)
  const chosenLanguages = values.selected_languages?.length || 1
  const cycle: 'monthly' | 'annual' = values.billing_cycle ?? 'monthly'

  return (
    <div className="flex flex-col gap-5">
      {/* Monthly or annual. A segmented control rather than two radios: it is
          one question with two answers and the saving belongs next to it. */}
      <div className="inline-flex self-start rounded-pill border border-line bg-surface p-1">
        {(['monthly', 'annual'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set({ billing_cycle: c })}
            aria-pressed={cycle === c}
            className={[
              'rounded-pill px-4 py-1.5 text-sm font-medium transition-colors duration-fast ease-calm',
              cycle === c ? 'bg-brand text-white' : 'text-ink-soft hover:text-brand-accent',
            ].join(' ')}
          >
            {c === 'monthly' ? t.planMonthly : t.planAnnual}
            {c === 'annual' && cycle !== 'annual' && (
              <span className="ml-2 text-xs text-brand-accent">{t.planAnnualHint}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {plans.map((plan) => {
          const price = cycle === 'annual' ? plan.annual : plan.monthly
          // Choosing a third language is what moves somebody from Essencial to
          // Clínica, so the plan that cannot carry the choice says so here
          // rather than failing on submit.
          const fits = plan.maxLanguages === null || chosenLanguages <= plan.maxLanguages
          return (
            <OptionCard
              key={plan.id}
              name="plan_id"
              value={plan.id}
              checked={values.plan_id === plan.id}
              onSelect={() => fits && set({ plan_id: plan.id })}
              title={plan.name}
              aside={
                <span className="text-base font-medium text-ink">
                  {price === null ? '—' : euros(price)}
                  <span className="text-sm font-normal text-ink-mute">
                    {cycle === 'annual' ? t.perYear : t.perMonth}
                  </span>
                </span>
              }
            >
              {plan.minutes} {t.includedMinutes}
              {plan.maxLanguages !== null && ` · ${plan.maxLanguages} ${t.planLanguages}`}
              {plan.locations > 1 && ` · ${plan.locations} ${t.locations}`}
              {plan.description && ` · ${plan.description}`}
              {!fits && (
                <span className="mt-1 block font-medium text-warn">
                  {t.planTooFewLanguages}
                </span>
              )}
            </OptionCard>
          )
        })}
      </div>

      {errors.plan_id && (
        <p role="alert" className="text-sm font-medium text-danger">
          {errors.plan_id}
        </p>
      )}

      <p className="text-sm text-ink-mute">
        {t.needMore}{' '}
        <a href="mailto:ola@telmaatende.com" className="text-brand-accent underline">
          {t.needMoreLink}
        </a>
        .
      </p>

      <div className="rule" />

      <Checkbox
        name="addon_whatsapp"
        checked={values.addon_whatsapp}
        onChange={(v) => set({ addon_whatsapp: v })}
      >
        {t.addonWhatsapp}
        <span className="mt-0.5 block text-sm text-ink-mute">{t.addonWhatsappHelp}</span>
      </Checkbox>

    </div>
  )
}
