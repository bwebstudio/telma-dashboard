import type { Dictionary } from './types'
import { pt } from './pt'
import { es } from './es'

// Adding a language is a two line change here plus one new file: copy an
// existing dictionary, translate the values, register it below. Components
// never contain literal interface text, so none of them have to be touched.
// Portuguese and Spanish. English is written and kept in content/en.ts, and is
// not offered: the panel is used by receptionists in Portugal and Spain, and a
// third entry in the switcher is a third thing to explain to somebody who has
// had no training and is deciding whether this is worth paying for. Registering
// it again is putting two names back on these two lines.
export const dictionaries: Record<string, Dictionary> = { pt, es }
export const locales = ['pt', 'es'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'pt'

// Shown in the language switcher. Each language names itself.
export const localeNames: Record<Locale, string> = {
  pt: 'Português',
  es: 'Español',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export type { Dictionary }
