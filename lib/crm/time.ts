import type { Locale } from '@/content'
import type { CrmCountry } from './types'

// Time in the CRM is never "server time".
//
// Vercel runs in UTC, Domingos is in Lisbon and Sonia in Madrid, and those two
// are not the same hour. A note that says "ligar às 14h30" has to read 14h30
// on the phone, so every timestamp is formatted in the timezone of the country
// it belongs to, on the server, deterministically. That also keeps client and
// server markup identical, which a client side toLocaleTimeString would not.

export const TZ_BY_COUNTRY: Record<CrmCountry, string> = {
  PT: 'Europe/Lisbon',
  ES: 'Europe/Madrid',
}

const LOCALE_TAGS: Record<Locale, string> = {
  pt: 'pt-PT',
  es: 'es-ES',
  en: 'en-GB',
}
const tag = (l: Locale) => LOCALE_TAGS[l] ?? 'pt-PT'

export function tzFor(country: CrmCountry | null | undefined): string {
  return TZ_BY_COUNTRY[country ?? 'PT'] ?? 'Europe/Lisbon'
}

// How far the zone is from UTC at that instant, daylight saving included.
function offsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  )
  // Intl gives no milliseconds, so asUtc is truncated to the second. Rounding
  // to whole minutes recovers the exact offset (every zone is a whole number of
  // minutes from UTC) instead of leaking the sub-second remainder into the day
  // boundaries computed below.
  return Math.round((asUtc - date.getTime()) / 60_000)
}

function localParts(date: Date, tz: string): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number)
  return { y, m, d }
}

// The instant at which the day ends in that zone. Used by HOJE to decide what
// counts as "today or overdue".
export function endOfDayIn(tz: string, base: Date = new Date()): Date {
  const { y, m, d } = localParts(base, tz)
  const naive = Date.UTC(y, m - 1, d, 23, 59, 59, 999)
  // Two passes: the first offset may belong to the wrong side of a DST switch.
  const first = new Date(naive - offsetMinutes(base, tz) * 60_000)
  return new Date(naive - offsetMinutes(first, tz) * 60_000)
}

export function startOfDayIn(tz: string, base: Date = new Date()): Date {
  const { y, m, d } = localParts(base, tz)
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0)
  const first = new Date(naive - offsetMinutes(base, tz) * 60_000)
  return new Date(naive - offsetMinutes(first, tz) * 60_000)
}

export function isSameDayIn(a: Date, b: Date, tz: string): boolean {
  const pa = localParts(a, tz)
  const pb = localParts(b, tz)
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d
}

export function timeIn(iso: string, locale: Locale, tz: string): string {
  return new Date(iso).toLocaleTimeString(tag(locale), {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dateIn(iso: string, locale: Locale, tz: string): string {
  return new Date(iso).toLocaleDateString(tag(locale), {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
  })
}

export function dateTimeIn(iso: string, locale: Locale, tz: string): string {
  return `${dateIn(iso, locale, tz)}, ${timeIn(iso, locale, tz)}`
}

// "Today at 15:07" collapses to just the hour; anything else keeps the date.
export function smartStamp(iso: string, locale: Locale, tz: string, now = new Date()): string {
  const d = new Date(iso)
  return isSameDayIn(d, now, tz) ? timeIn(iso, locale, tz) : dateTimeIn(iso, locale, tz)
}

// Whole hours or days late, for the overdue rows. Never seconds: nobody is
// reading a stopwatch on the street.
export function lateness(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
