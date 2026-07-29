import type { Locale } from '@/content'

const LOCALE_TAGS: Record<Locale, string> = {
  pt: 'pt-PT',
  es: 'es-ES',
  en: 'en-GB',
}
const localeTag = (l: Locale) => LOCALE_TAGS[l] ?? 'pt-PT'

export function formatTime(iso: string, l: Locale): string {
  return new Date(iso).toLocaleTimeString(localeTag(l), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string, l: Locale): string {
  return new Date(iso).toLocaleDateString(localeTag(l), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string, l: Locale): string {
  return `${formatDate(iso, l)}, ${formatTime(iso, l)}`
}

export function formatWeekdayDate(iso: string, l: Locale): string {
  return new Date(iso).toLocaleDateString(localeTag(l), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

export function formatDuration(seconds: number, _l: Locale): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}min ${s.toString().padStart(2, '0')}s`
}

export function formatEuro(value: number, l: Locale): string {
  return new Intl.NumberFormat(localeTag(l), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// First day of the current month, as YYYY-MM-DD (matches the usage.month key).
export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}
