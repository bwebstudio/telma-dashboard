import type { Dictionary } from './types'
import { pt } from './pt'
import { en } from './en'

export const dictionaries: Record<string, Dictionary> = { pt, en }
export const locales = ['pt', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'pt'

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export type { Dictionary }
