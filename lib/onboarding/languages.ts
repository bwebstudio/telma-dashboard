import type { OnboardingLocale } from './locale'

/**
 * The languages Telma can answer a call in.
 *
 * Not the same list as the languages the sign-up form is written in. The form
 * speaks Portuguese and Spanish because those are the two markets; the agent
 * speaks whatever the clinic's patients speak, which in Barcelona may be
 * Catalan and on the Algarve may be English.
 *
 * The list itself lives in the `available_languages` table, not here. That is
 * the point of the model: adding German is one insert, not a code change and a
 * pricing exercise. This file holds only what the code has to know about the
 * shape of a language, and the rule for which one cannot be removed.
 */

export interface LanguageOption {
  code: string
  /** Named in itself: "Català", never our word for it. */
  name: string
  /** Named in the reader's language, for the sentence around it. */
  label: string
  /** 'available' can be chosen. 'coming_soon' is drawn and disabled: announcing
   *  a language is not the same as having it. */
  status: 'available' | 'coming_soon' | 'deprecated'
}

/**
 * The language a clinic cannot remove.
 *
 * Its own, decided by the country it is in. Deliberately not always Portuguese:
 * Telma is sold in Spain too, and a clinic in Barcelona forced to keep
 * Portuguese would spend one of the two slots its plan includes on a language
 * none of its patients speak. What has to be true is that there is always a
 * base language and that it is included; which one depends on where the clinic
 * is, and that is what `clinics.language` records.
 */
export function baseLanguageFor(locale: OnboardingLocale): string {
  return locale === 'es' ? 'es' : 'pt'
}

/**
 * How many languages a plan includes. Null is unlimited.
 *
 * The wizard asks about languages (step 4) before it asks about the plan
 * (step 6), which is the right order for the reader: what Telma has to speak is
 * a fact about the clinic, and the plan is what that costs. So the picker caps
 * at the most generous plan on offer and the plan step marks which plans fit,
 * which is also how the model is meant to sell: choosing a third language is
 * what moves somebody from Essencial to Clínica.
 */
export const UNLIMITED_LANGUAGES = null

export function planFits(selected: number, max: number | null): boolean {
  return max === null || selected <= max
}
