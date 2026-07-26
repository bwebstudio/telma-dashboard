import { cookies } from 'next/headers'
import { dictionaries, defaultLocale, isLocale, type Locale } from '@/content'

export const LOCALE_COOKIE = 'telma_locale'

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return value && isLocale(value) ? value : defaultLocale
}

export async function getDict() {
  const locale = await getLocale()
  return { locale, dict: dictionaries[locale] }
}
