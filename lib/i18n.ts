import { cookies } from 'next/headers'
import { dictionaries, defaultLocale, isLocale, type Locale } from '@/content'
import { getAppUser } from './auth'

export const LOCALE_COOKIE = 'telma_locale'

// The interface language follows the signed in user: Domingos sees Portuguese,
// Sonia sees Spanish, on exactly the same data. The cookie is only written when
// somebody picks another language by hand, and then it wins for that browser.
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  if (value && isLocale(value)) return value

  const user = await getAppUser()
  if (user?.locale && isLocale(user.locale)) return user.locale

  return defaultLocale
}

export async function getDict() {
  const locale = await getLocale()
  return { locale, dict: dictionaries[locale] }
}
