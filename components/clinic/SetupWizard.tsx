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
        const first = Object.keys(r.errors)[0]
        if (first && first !== '_form') {
          document
            .querySelector<HTMLElement>(`[name="${first}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
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
                  ? 'bg-ink text-white'
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
