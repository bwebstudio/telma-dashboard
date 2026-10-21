'use client'

import { useState, useTransition } from 'react'
import type { Dictionary } from '@/content'
import type { LanguageOption } from '@/lib/onboarding/languages'
import type { OnboardingLocale } from '@/lib/onboarding/locale'
import { HoursStep, ServicesStep, TelmaStep } from '@/components/onboarding/FormSections'
import { PromptPreview } from '@/components/onboarding/PromptPreview'
import { saveSetupHours } from '@/lib/actions/setup-wizard'
import { updateClinicLanguages } from '@/lib/actions/clinic-settings'
import { LanguagesSection } from '@/components/clinic/LanguagesSection'
import { updateClinicProfile } from '@/lib/actions/clinic-settings'
import { activateClinic } from '@/lib/actions/activate'
import { IconCheck } from '@/components/icons'

/**
 * The first hour in the panel, as one guided path instead of a list of links.
 *
 * What was here before was a card with two links on it: "say when you are
 * open" and "say what you do", each going off to a settings page the clinic
 * had never seen, with a back button and no sense of progress. It worked in
 * the sense that the fields were reachable. It did not work in the sense that
 * somebody who has just paid wants to be told what to do next, once, and to
 * see that it is nearly over.
 *
 * ── THE SAME COMPONENTS, NOT NEW ONES ────────────────────────────────────
 * Each step renders the field group the settings pages already render, for
 * the reason TelmaSettingsForm gives about itself: two forms over one set of
 * fields drift, and the one that drifts is the one nobody is testing. A
 * clinic that answers a question here and comes back to it in a month meets
 * the same question, worded and validated the same way.
 *
 * ── EACH STEP SAVES BEFORE IT ADVANCES ───────────────────────────────────
 * Not at the end. Somebody doing this on a phone between patients will be
 * interrupted, and an hour of answers lost to a closed tab is the kind of
 * thing a clinic does not come back from. Going back and changing something
 * re-saves it on the way forward again.
 *
 * ── THE LAST STEP IS READING, NOT TYPING ─────────────────────────────────
 * It shows their answers back as sentences about their clinic -- the same
 * panel the sign-up used -- and only then offers the button that puts Telma
 * on the telephone. Nobody should turn on a receptionist without having seen
 * what she is going to say.
 */

type Values = Record<string, unknown>

// Languages before `telma`, because the greeting step asks which of them she
// opens the call in and can only offer the ones the clinic has.
const STEP_IDS = ['hours', 'services', 'languages', 'telma', 'review'] as const
type StepId = (typeof STEP_IDS)[number]

/**
 * Which step draws which field.
 *
 * Saving validates more than the step on screen -- deliberately, because the
 * rules are the sign-up's own and a second copy per step is a copy that will
 * disagree -- so a failure has to be routed to the step that can fix it.
 * Without this the button simply stops working: the message is anchored to an
 * input that is not on the page, nothing highlights, nothing scrolls.
 *
 * Keyed on the first segment of the field, so `pause.end` is routed by
 * `pause`. Anything not listed belongs to no step in this wizard: those are
 * the profile fields the sign-up collected, and they are edited in A minha
 * clínica.
 */
const STEP_FIELDS: Record<StepId, readonly string[]> = {
  hours: [
    'weekdays',
    'saturday',
    'sunday',
    'pause',
    'appointment_duration_minutes',
    'min_interval_minutes',
  ],
  services: ['services', 'custom_services', 'service_prices', 'service_durations'],
  languages: ['selected_languages'],
  telma: [
    'takes_bookings',
    'greeting',
    'greeting_language',
    'formality',
    'fallback_policy',
    'fallback_number',
    'briefing',
    'emergency_number',
    'emergency_protocol',
    'after_hours_transfer',
    'after_hours_number',
    'after_hours_patients_only',
  ],
  review: [],
}

/** The step that can fix this complaint, or -1 when no step can. */
function stepFor(key: string): number {
  const root = key.split('.')[0]
  return STEP_IDS.findIndex((stepId) => STEP_FIELDS[stepId].includes(root))
}

export function SetupWizard({
  initial,
  locale,
  languages,
  languageSettings,
  dict,
  hasHours,
}: {
  initial: Values
  locale: OnboardingLocale
  languages: LanguageOption[]
  /**
   * What the plan includes and what the clinic has today.
   *
   * A clinic on a plan with three languages signed up with one, because the
   * sign-up never asked and seeded whichever language the form was filled in.
   * Nothing afterwards pointed at the other two, so they were paid for and
   * invisible.
   */
  languageSettings: {
    languages: Array<{ code: string; name: string; status: 'available' | 'coming_soon' | 'deprecated' }>
    selected: string[]
    base: string
    max: number | null
  }
  dict: Dictionary
  /** True when the timetable already exists, so the first step opens filled
   *  rather than on the defaults. */
  hasHours: boolean
}) {
  const t = dict.setupWizard
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Somebody who already set their hours elsewhere starts past that step
  // rather than being asked a question they have answered.
  const [step, setStep] = useState(0)
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)
  const [langs, setLangs] = useState<string[]>(
    languageSettings.selected.length ? languageSettings.selected : [languageSettings.base]
  )

  const id: StepId = STEP_IDS[step]
  const last = step === STEP_IDS.length - 1
  const set = (patch: Values) => {
    setValues((v) => ({ ...v, ...patch }))
    setFailed(null)
  }

  function go(to: number) {
    setErrors({})
    setFailed(null)
    setStep(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function next() {
    setErrors({})
    setFailed(null)
    start(async () => {
      // Languages have their own action: the plan's ceiling is checked there
      // and again by the trigger, and `updateClinicProfile` does not touch
      // them. Saved here, and mirrored into `values` so the next step can
      // offer them as the one she greets in.
      if (id === 'languages') {
        const saved = await updateClinicLanguages(langs)
        if (!saved.ok) {
          setFailed(saved.error === 'too_many' ? t.tooManyLanguages : t.saveFailed)
          return
        }
        setValues((v) => ({ ...v, selected_languages: langs }))
        return go(step + 1)
      }

      const r =
        id === 'hours'
          ? await saveSetupHours(values, locale)
          : await updateClinicProfile(values, locale)
      if (!r.ok) {
        setErrors(r.errors)

        // ── SENDING THE COMPLAINT WHERE IT CAN BE ANSWERED ───────────────
        // Three places it can belong: this step, which draws it and is
        // already showing it; another step, which is where the clinic has to
        // be taken; or no step at all, which means the sign-up collected it
        // and it is changed in A minha clínica.
        const keys = Object.keys(r.errors).filter((key) => key !== '_form')
        if (keys.some((key) => stepFor(key) === step)) return

        const elsewhere = keys.map(stepFor).filter((n) => n >= 0)
        if (elsewhere.length) {
          setStep(Math.min(...elsewhere))
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }

        // Nothing in this wizard can fix it. Said in words, because the only
        // other outcome is a button that does nothing.
        if (keys.length) setFailed(t.missingElsewhere)
        return
      }
      go(step + 1)
    })
  }

  function activate() {
    setFailed(null)
    start(async () => {
      const r = await activateClinic()
      // The page is a server component keyed on the clinic's status, so a
      // successful activation re-renders it as the agenda. Nothing to do here
      // but refresh; `activateClinic` revalidates.
      //
      // ── ONE REFUSAL IS NOT A FAILURE ──────────────────────────────────
      // The action also gates on the number being real, and that is the one
      // thing on its list that the clinic cannot do and that retrying cannot
      // fix. "Try again" sent a clinic round a loop it could not leave, at
      // the end of five steps it had just done properly, so say which it is.
      if (!r.ok) {
        setFailed(r.missing?.includes('number') ? t.activateNoNumber : t.activateFailed)
      }
    })
  }

  const stepProps = { values, set, errors, locale }

  return (
    <section className="card p-6 sm:p-8">
      {/* ── WHERE AM I, FIFTEEN HUNDRED PIXELS DOWN ──────────────────────
          The step list below scrolls away with everything else, and a long
          step -- the services, the week -- leaves somebody filling in a form
          with no sign of which form it is or how much of it is left. One
          line, stuck to the top of the card: the process, the step, and the
          count. Not the whole header, which would take a third of a laptop
          screen to say what one line says.

          `top-0` and not an offset: the panel's own header is not sticky on
          a desktop, and on a phone this card starts below it anyway. */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface px-6 py-3 sm:-mx-8 sm:px-8">
        <p className="min-w-0 truncate text-base font-medium text-ink">
          {dict.comecar.navItem} <span className="text-ink-mute">·</span> {t.steps[id]}
        </p>
        <p className="label-caps shrink-0 text-ink-mute">
          {t.stepOf
            .replace('{n}', String(step + 1))
            .replace('{total}', String(STEP_IDS.length))}
        </p>
      </div>

      <Progress step={step} total={STEP_IDS.length} labels={t.steps} done={t.doneLabel} />

      <h2 className="mt-6 text-2xl font-semibold text-ink sm:text-3xl">{t.titles[id]}</h2>
      <p className="mt-2 max-w-prose text-lg text-ink-soft">{t.leads[id]}</p>

      {errors._form && (
        <p
          role="alert"
          className="mt-5 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-base font-medium text-danger"
        >
          {errors._form}
        </p>
      )}

      <div className="mt-7">
        {id === 'hours' && <HoursStep {...stepProps} />}
        {id === 'services' && <ServicesStep {...stepProps} inPanel />}
        {id === 'languages' && (
          <LanguagesSection
            languages={languageSettings.languages}
            selected={langs}
            base={languageSettings.base}
            max={languageSettings.max}
            readOnly={false}
            embedded
            onChange={setLangs}
            labels={{
              ...dict.languagesSection,
              save: dict.common.save,
              saving: dict.common.saving,
              saved: dict.common.saved,
              error: dict.common.errorGeneric,
              readOnly: dict.billing.readOnly,
            }}
          />
        )}
        {id === 'telma' && (
          <TelmaStep
            {...stepProps}
            // Same arrangement as the settings page: which languages a clinic
            // has is billing and lives on the account page, which one Telma
            // greets in is not and belongs with how she answers. The preview
            // is off here because the whole next step is the preview.
            languages={languages}
            maxLanguages={null}
            showLanguages={false}
            showGreetingLanguage
            showPreview={false}
          />
        )}
        {id === 'review' && (
          <PromptPreview values={values} locale={locale} copy={dict.promptPreview} help={t.reviewHelp} />
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="btn-secondary">
            {t.back}
          </button>
        )}
        {last ? (
          <button
            type="button"
            onClick={activate}
            disabled={pending}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? t.activating : t.activate}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? t.saving : t.continue}
          </button>
        )}
        {failed && (
          <span role="alert" className="text-base text-danger">
            {failed}
          </span>
        )}
        {!last && hasHours && step === 0 && (
          <span className="text-base text-ink-mute">{t.hoursAlready}</span>
        )}
      </div>
    </section>
  )
}

/**
 * Where they are, and how much is left.
 *
 * Named steps and not a bare bar: "step 2 of 4" tells somebody how long it is,
 * and the names tell them what is coming, which is the part that stops a
 * person abandoning halfway to go and find a document.
 */
function Progress({
  step,
  total,
  labels,
  done,
}: {
  step: number
  total: number
  labels: Record<StepId, string>
  done: string
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STEP_IDS.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'now' : 'todo'
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                state === 'done'
                  ? 'bg-ink text-on-ink'
                  : state === 'now'
                    ? 'bg-accent text-ink'
                    : 'border border-line-strong text-ink-mute'
              }`}
            >
              {state === 'done' ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={`text-sm ${state === 'todo' ? 'text-ink-mute' : 'text-ink'}`}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              {labels[s]}
              {state === 'done' && <span className="sr-only"> {done}</span>}
            </span>
            {i < total - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-line-strong" />}
          </li>
        )
      })}
    </ol>
  )
}
