import type { Locale } from '@/content'

const localeTag = (l: Locale) => (l === 'pt' ? 'pt-PT' : 'en-GB')

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

export function formatDuration(seconds: number, l: Locale): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const unit = l === 'pt' ? 'min' : 'min'
  if (m === 0) return `${s}s`
  return `${m}${unit} ${s.toString().padStart(2, '0')}s`
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
