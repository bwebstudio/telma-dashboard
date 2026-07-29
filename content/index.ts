import type { Dictionary } from './types'
import { pt } from './pt'
import { en } from './en'
import { es } from './es'

// Adding a language is a two line change here plus one new file: copy an
// existing dictionary, translate the values, register it below. Components
// never contain literal interface text, so none of them have to be touched.
export const dictionaries: Record<string, Dictionary> = { pt, en, es }
export const locales = ['pt', 'es', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'pt'

// Shown in the language switcher. Each language names itself.
export const localeNames: Record<Locale, string> = {
  pt: 'Português',
  es: 'Español',
  en: 'English',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export type { Dictionary }
