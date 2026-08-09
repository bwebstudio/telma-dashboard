'use client'

import { useEffect, useState, useTransition } from 'react'
import { completeOnboarding, submitWizardStep } from '@/lib/actions/onboarding'
import type { OnboardingResult } from '@/lib/actions/onboarding'
import { copyFor } from '@/lib/onboarding/copy'
import {
  DEFAULT_ONBOARDING_LOCALE,
  LOCALE_NAME,
  ONBOARDING_LOCALES,
  type OnboardingLocale,
} from '@/lib/onboarding/locale'

import type { LanguageOption } from '@/lib/onboarding/languages'
import { StepIndicator } from './StepIndicator'
import { Done } from './Done'
import {
  ClinicStep,
  HoursStep,
  NumberStep,
  PlanStep,
  ServicesStep,
  TelmaStep,
  type SignupPlan,
  type Values,
} from './FormSections'

export type { SignupPlan }

/**
 * The six steps, and everything that keeps them from being six forms.
 *
 * The whole sign-up is one object in one piece of state. Advancing a step sends
 * that object to `submitWizardStep`, which validates it against the step's
 * schema and merges what it accepts into the server side draft. The browser
 * never decides whether an answer is good; it only draws what came back.
 *
 * There are two copies of the draft on purpose. localStorage is the fast one:
 * it survives a refresh with no round trip and no database. The server copy is
 * the durable one: it survives a different device, a cleared browser, and it is
 * the only one the sales team can see when somebody stops at step four.
 */

const STORAGE_KEY = 'telma_onboarding_v1'

/**
 * Which step each answer belongs to.
 *
 * The last step submits the whole sign-up, so a rejection can be about
 * something answered four steps ago: a duplicated email is caught at submit and
 * lives on step 2. Setting the error and staying put shows the reader a red
 * message about a field that is not on screen, which is indistinguishable from
 * the form being broken.
 */
const FIELD_STEP: Record<string, number> = {
  plan_id: 1, billing_cycle: 1, addon_whatsapp: 1,
  clinic_name: 2, email: 2, phone: 2, address: 2, specialty: 2, region: 2, locale: 2,
  weekdays: 3, saturday: 3, sunday: 3, pause: 3,
  appointment_duration_minutes: 3, min_interval_minutes: 3,
  services: 4, custom_services: 4, price_info: 4,
  selected_languages: 5, greeting_language: 5, formality: 5,
  fallback_policy: 5, fallback_number: 5, briefing: 5,
  emergency_number: 5, emergency_protocol: 5,
  phone_option: 6, current_number: 6, operator: 6, area_region: 6, terms: 6,
}

/** The earliest step carrying an error, so the reader lands on the first thing
 *  to fix rather than the last. `_form` belongs to wherever they already are. */
function firstStepWithError(errors: Record<string, string>, current: number): number {
  const steps = Object.keys(errors)
    .map((key) => FIELD_STEP[key.split('.')[0]])
    .filter((n): n is number => typeof n === 'number')
  return steps.length ? Math.min(...steps) : current
}

// What the form starts as. Chosen to be right for most Portuguese clinics
// rather than to be empty: an unanswered question is slower to answer than a
// wrong answer is to correct, and every one of these is visible on screen.
const INITIAL: Values = {
  clinic_name: '',
  email: '',
  phone: '',
  specialty: '',
  region: '',
  weekdays: { closed: false, open: '09:00', close: '19:00' },
  saturday: { closed: false, open: '09:00', close: '13:00' },
  sunday: { closed: true, open: '09:00', close: '13:00' },
  pause: { enabled: true, start: '13:00', end: '14:00' },
  appointment_duration_minutes: 30,
  min_interval_minutes: 30,
  services: [],
  custom_services: '',
  selected_languages: [],
  address: '',
  price_info: '',
  greeting_language: '',
  formality: 'formal',
  fallback_policy: 'message',
  fallback_number: '',
  briefing: '',
  emergency_number: '',
  emergency_protocol: '',
  phone_option: 'new',
  current_number: '',
  operator: '',
  area_region: '',
  plan_id: 'clinica',
  billing_cycle: 'monthly',
  addon_whatsapp: false,
  terms: false,
}

interface Stored {
  token: string | null
  step: number
  values: Values
}

export function WizardForm({
  plans,
  demo,
  initialPlan = null,
  locale = DEFAULT_ONBOARDING_LOCALE,
  languages,
  maxLanguages,
}: {
  plans: SignupPlan[]
  demo: boolean
  /** Everything the platform can speak, from `available_languages`. */
  languages: LanguageOption[]
  /** The ceiling of the most generous plan on sale. */
  maxLanguages: number | null
  /** Preselected from `?plano=` when the reader came from a price card. */
  initialPlan?: string | null
  locale?: OnboardingLocale
}) {
  const t = copyFor(locale)
  const STEPS = t.steps
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<Values>({
    ...INITIAL,
    locale,
    // Suggested from the language the form is being read in, and nothing more.
    // Which languages a clinic speaks is its decision, not one deduced from its
    // address: an international practice in Lisbon may answer only in English.
    selected_languages: [locale],
    greeting_language: locale,
    ...(initialPlan ? { plan_id: initialPlan } : {}),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [token, setToken] = useState<string | null>(null)
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [pending, startTransition] = useTransition()
  // Until this is true nothing is written back to localStorage, so the first
  // render does not overwrite a saved draft with the defaults.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Stored
        // Merged over the defaults, never substituted for them: a draft saved
        // before a new question existed must not leave that question undefined.
        //
        // `initialPlan` wins over the stored one. Clicking "Começar" on the
        // Rede card is an explicit choice made just now; the plan sitting in a
        // draft from yesterday is not.
        if (saved.values) {
          setValues({
            ...INITIAL,
            ...saved.values,
            locale,
            ...(initialPlan ? { plan_id: initialPlan } : {}),
          })
        }
        if (saved.token) setToken(saved.token)
        if (saved.step >= 1 && saved.step <= STEPS.length) setStep(saved.step)
      }
    } catch {
      // A corrupt draft is not worth a broken form. Start clean.
    }
    setHydrated(true)
    // Runs once. `initialPlan` comes from the URL of the render this mounted
    // in, so it cannot change without a navigation, and re-running this would
    // throw away everything typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, step, values }))
    } catch {
      // Private browsing, or a full quota. The server draft still has it.
    }
  }, [hydrated, token, step, values])

  function set(patch: Values) {
    setValues((v) => ({ ...v, ...patch }))
    // Clear only what was touched. Wiping every error on every keystroke means
    // the three still-wrong fields disappear the moment you fix the first.
    setErrors((e) => {
      const next = { ...e }
      let changed = false
      for (const key of Object.keys(patch)) {
        for (const errKey of Object.keys(next)) {
          if (errKey === key || errKey.startsWith(`${key}.`)) {
            delete next[errKey]
            changed = true
          }
        }
      }
      return changed ? next : e
    })
  }

  function back() {
    setErrors({})
    setStep((s) => Math.max(1, s - 1))
  }

  function next() {
    startTransition(async () => {
      const state = await submitWizardStep(step, values, token, locale)
      if (state.token) setToken(state.token)
      if (!state.ok) {
        setErrors(state.errors ?? {})
        // The first bad field is usually above the fold on a phone only by
        // accident. Put the reader back at the top of the step they failed.
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setErrors({})
      setStep((s) => Math.min(STEPS.length, s + 1))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  function submit() {
    startTransition(async () => {
      // Save the last step before completing. Every other step is stored by
      // `next()` on the way past; this one has no "next", so without this it was
      // never written, and `completeOnboarding` reads the stored draft rather
      // than what the browser sends. The symptom was the final button rejecting
      // a ticked terms box, because the draft had no `terms` in it at all.
      const saved = await submitWizardStep(STEPS.length, values, token, locale)
      if (saved.token) setToken(saved.token)
      if (!saved.ok) {
        setErrors(saved.errors ?? {})
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      const state = await completeOnboarding(saved.token ?? token, values, locale)
      if (!state.ok) {
        setErrors(state.errors)
        setStep(firstStepWithError(state.errors, STEPS.length))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      // The draft has become a clinic. Clearing it now is what stops a refresh
      // from offering to sign the same clinic up a second time.
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* nothing to clear */
      }

      if (state.result.checkoutUrl) {
        // Off to Stripe. No `setResult` first: rendering the password for the
        // half second before the redirect would put it in a screenshot.
        window.location.assign(state.result.checkoutUrl)
        return
      }
      setResult(state.result)
    })
  }

  if (result) return <Done result={result} locale={locale} values={values} />

  const meta = STEPS[step - 1]
  const isLast = step === STEPS.length

  // The plan is chosen on step 1, so by the time step 5 asks about languages the
  // ceiling is known. That is the whole reason the plan moved to the front.
  const planMaxLanguages =
    plans.find((p) => p.id === values.plan_id)?.maxLanguages ?? maxLanguages

  return (
    <div className="flex flex-col gap-8">
      {/* The language switcher, as a control rather than as two small links.
          It was a pair of 14px words aligned right, which is findable if you
          already know it is there. Somebody who opened this in the wrong
          language is, by definition, somebody who cannot read the label next to
          it, so it has to be recognisable as a switch by its shape alone.

          It carries the step across, so changing language does not restart the
          form, and it is a link rather than a button because it is a navigation
          and should survive being opened in a new tab. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-mute">{t.languageLabel}</p>
        <div
          className="inline-flex rounded-pill border border-line bg-surface-sunken p-1"
          role="group"
          aria-label={t.languageLabel}
        >
          {ONBOARDING_LOCALES.map((l) => (
            <a
              key={l}
              href={`?lang=${l}`}
              aria-current={l === locale ? 'true' : undefined}
              className={[
                'rounded-pill px-4 py-1.5 text-sm transition-colors duration-fast ease-calm',
                l === locale
                  ? 'bg-surface font-medium text-ink shadow-sm'
                  : 'text-ink-mute hover:text-ink',
              ].join(' ')}
            >
              {LOCALE_NAME[l]}
            </a>
          ))}
        </div>
      </div>

      <StepIndicator current={step} locale={locale} />

      <div>
        <h2 className="h-display text-2xl sm:text-3xl">{meta.title}</h2>
        <p className="mt-2 max-w-lead text-base text-ink-soft">{meta.help}</p>
      </div>

      {errors._form && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-base font-medium text-danger"
        >
          {errors._form}
        </p>
      )}

      {/* A form element, so Enter submits the step rather than doing nothing.
          On the last step Enter must not sign the clinic up: that one asks for
          a deliberate click on a button that says what it does. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!isLast && !pending) next()
        }}
      >
        {step === 1 && (
          <PlanStep values={values} set={set} errors={errors} locale={locale} plans={plans} />
        )}
        {step === 2 && <ClinicStep values={values} set={set} errors={errors} locale={locale} />}
        {step === 3 && <HoursStep values={values} set={set} errors={errors} locale={locale} />}
        {step === 4 && <ServicesStep values={values} set={set} errors={errors} locale={locale} />}
        {step === 5 && (
          <TelmaStep
            values={values}
            set={set}
            errors={errors}
            locale={locale}
            languages={languages}
            maxLanguages={planMaxLanguages}
          />
        )}
        {step === 6 && (
          <NumberStep values={values} set={set} errors={errors} locale={locale} demo={demo} />
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {step > 1 && (
            <button type="button" onClick={back} disabled={pending} className="btn-secondary">
              {t.back}
            </button>
          )}

          {isLast ? (
            <button type="button" onClick={submit} disabled={pending} className="btn-primary">
              {pending ? t.submitting : t.submit}
            </button>
          ) : (
            <button type="submit" disabled={pending} className="btn-primary">
              {t.next}
            </button>
          )}

          <span className="text-sm text-ink-mute">{t.savedNotice}</span>
        </div>
      </form>
    </div>
  )
}
