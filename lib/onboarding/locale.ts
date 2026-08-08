/**
 * Which language the sign-up speaks.
 *
 * Portuguese and Spanish, and deliberately not the panel's full list. English
 * exists in content/en.ts because the panel is used by the internal team, but
 * nobody is sold Telma in English yet: the contract, the invoice and the voice
 * agent are all in one of these two, and a sign-up form in a language the rest
 * of the product does not speak promises something we cannot deliver.
 *
 * Adding a third is this file plus the two bundles in copy.ts and catalog.ts.
 *
 * Nothing here may touch `next/headers`. The client components import
 * `ONBOARDING_LOCALES` and `LOCALE_NAME` to draw the language switcher, and a
 * value import drags the whole module into the browser bundle: one server-only
 * import in this file and the production build stops with "you're importing a
 * component that needs next/headers". Detection lives in locale-server.ts.
 */
export const ONBOARDING_LOCALES = ['pt', 'es'] as const
export type OnboardingLocale = (typeof ONBOARDING_LOCALES)[number]
export const DEFAULT_ONBOARDING_LOCALE: OnboardingLocale = 'pt'

export function isOnboardingLocale(v: unknown): v is OnboardingLocale {
  return typeof v === 'string' && (ONBOARDING_LOCALES as readonly string[]).includes(v)
}

/** Each language names itself, never the other one's name for it. */
export const LOCALE_NAME: Record<OnboardingLocale, string> = {
  pt: 'Português',
  es: 'Español',
}
