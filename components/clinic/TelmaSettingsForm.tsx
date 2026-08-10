'use client'

import { useState, useTransition } from 'react'
import { updateClinicProfile } from '@/lib/actions/clinic-settings'
import { ClinicStep, ServicesStep, TelmaStep } from '@/components/onboarding/FormSections'
import { PromptPreview } from '@/components/onboarding/PromptPreview'
import type { LanguageOption } from '@/lib/onboarding/languages'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * The sign-up's own fields, after the sign-up.
 *
 * Deliberately the same components, not a second form that looks like them. A
 * clinic that fills in "what Telma says about prices" during sign-up and then
 * comes back a month later should meet the same question, worded the same way,
 * validated the same way. Two forms over one set of fields drift, and the one
 * that drifts is always the one nobody is testing.
 *
 * Saved in one go rather than field by field. These answers depend on each
 * other — saying calls transfer means a number is required, saying yes to
 * out-of-hours means somewhere to send them — and an autosave that accepts half
 * a decision leaves Telma announcing a transfer she cannot make.
 */

const COPY = {
  pt: {
    save: 'Guardar alterações',
    saving: 'A guardar...',
    saved: 'Guardado',
    unsaved: 'Tem alterações por guardar.',
    failed: 'Não foi possível guardar. Verifique os campos marcados.',
    clinic: 'A clínica',
    services: 'O que faz',
    telma: 'Como a Telma atende',
  },
  es: {
    save: 'Guardar cambios',
    saving: 'Guardando...',
    saved: 'Guardado',
    unsaved: 'Tiene cambios sin guardar.',
    failed: 'No se ha podido guardar. Revise los campos marcados.',
    clinic: 'La clínica',
    services: 'Qué hace',
    telma: 'Cómo contesta Telma',
  },
} as const

export function TelmaSettingsForm({
  initial,
  locale,
  languages,
  readOnly,
}: {
  initial: Record<string, unknown>
  locale: OnboardingLocale
  languages: LanguageOption[]
  readOnly: boolean
}) {
  const t = COPY[locale] ?? COPY.pt
  const [values, setValues] = useState<Record<string, unknown>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

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
      // The first bad field, brought into view. Somebody who presses save at the
      // bottom of a long page and sees nothing happen assumes it is broken.
      const first = Object.keys(r.errors)[0]
      if (first && first !== '_form') {
        document.querySelector<HTMLElement>(`[name="${first}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    })
  }

  // The wizard's steps all take the same four props; `as never` would silence
  // the spread but also silence a real mismatch, so the shape is named.
  const stepProps = { values, set, errors, locale }

  return (
    <div className="flex flex-col gap-10">
      <PromptPreview values={values} locale={locale} />

      <Section title={t.clinic}>
        <ClinicStep {...stepProps} />
      </Section>

      <Section title={t.services}>
        <ServicesStep {...stepProps} />
      </Section>

      <Section title={t.telma}>
        <TelmaStep
          {...stepProps}
          languages={languages.filter((l) =>
            ((initial.selected_languages as string[]) ?? []).includes(l.code)
          )}
          maxLanguages={null}
          // O selector de línguas não: essas dependem do plano e mudam-se na
          // conta. O de "em que língua atende" sim, e é por isso que a lista
          // acima vem filtrada pelas que esta clínica já paga.
          showLanguages={false}
          showGreetingLanguage
        />
      </Section>

      {errors._form && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-base font-medium text-danger"
        >
          {t.failed}
        </p>
      )}

      {/* Sticky, because this form is long enough that the button would
          otherwise be somewhere the reader is not. */}
      {!readOnly && (
        <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <p className="text-sm text-ink-mute">
            {pending ? t.saving : dirty ? t.unsaved : saved ? t.saved : ''}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="btn-primary min-h-0 px-5 py-2.5 text-sm disabled:opacity-40"
          >
            {pending ? t.saving : t.save}
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}
