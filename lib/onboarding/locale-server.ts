import { cookies, headers } from 'next/headers'
import { LOCALE_COOKIE } from '@/lib/i18n'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale, type OnboardingLocale } from './locale'

/**
 * Working out which language to open the sign-up in.
 *
 * Split from locale.ts because it reads `next/headers`, and locale.ts is
 * imported by the client components that draw the language switcher. Keeping
 * the two in one file makes the production build fail on the server-only
 * import, which is a confusing way to learn where the boundary is.
 */

/**
 * Works out which one to open in.
 *
 * In order: what the URL asked for, what this browser chose last time, what the
 * browser itself says it wants, and Portugal as the fallback.
 *
 * The Accept-Language step matters more here than anywhere else in the app. Every
 * other screen has a signed in user whose language is stored; this one is the
 * first thing a stranger sees, and getting it wrong means a Spanish clinic reads
 * a Portuguese form and decides the product is not for them. Portuguese and
 * Spanish look similar enough on a page that somebody may not even register why
 * it feels off.
 */
export async function resolveOnboardingLocale(
  requested?: string | null
): Promise<OnboardingLocale> {
  if (isOnboardingLocale(requested)) return requested

  const store = await cookies()
  const saved = store.get(LOCALE_COOKIE)?.value
  if (isOnboardingLocale(saved)) return saved

  const header = (await headers()).get('accept-language') ?? ''
  // "es-ES,es;q=0.9,pt;q=0.8" reads left to right by weight, and the browser
  // has already sorted it. First tag that is one of ours wins.
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().slice(0, 2).toLowerCase()
    if (isOnboardingLocale(tag)) return tag
  }

  return DEFAULT_ONBOARDING_LOCALE
}
