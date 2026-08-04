import type { Locale } from '@/content'

// Time is never "server time".
//
// Vercel runs in UTC. The reps are in Lisbon and Madrid, and so are the
// clinics. A note that says "ligar às 14h30" has to read 14h30 on the phone,
// and an agenda's day has to start when the clinic's day starts — not when
// UTC's does. So every timestamp is formatted in the zone it belongs to, on the
// server, deterministically. That also keeps client and server markup
// identical, which a client side toLocaleTimeString would not.
//
// This file is the zone arithmetic itself. Who is in which zone is decided by
// the caller: the CRM asks the rep's country, the clinic panel asks the clinic.

const LOCALE_TAGS: Record<Locale, string> = {
  pt: 'pt-PT',
  es: 'es-ES',
  en: 'en-GB',
}
const tag = (l: Locale) => LOCALE_TAGS[l] ?? 'pt-PT'

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

export function localParts(date: Date, tz: string): { y: number; m: number; d: number } {
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

/** YYYY-MM-DD, as that zone reads the calendar. The key the agenda routes on. */
export function dayKeyIn(tz: string, base: Date = new Date()): string {
  const { y, m, d } = localParts(base, tz)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function boundary(tz: string, base: Date, end: boolean): Date {
  const { y, m, d } = localParts(base, tz)
  const naive = end
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d, 0, 0, 0, 0)
  // Two passes: the first offset may belong to the wrong side of a DST switch.
  const first = new Date(naive - offsetMinutes(base, tz) * 60_000)
  return new Date(naive - offsetMinutes(first, tz) * 60_000)
}

export function endOfDayIn(tz: string, base: Date = new Date()): Date {
  return boundary(tz, base, true)
}

export function startOfDayIn(tz: string, base: Date = new Date()): Date {
  return boundary(tz, base, false)
}

/** Midday of the day `offset` days from `base`, in that zone. Safe to shift. */
export function dayIn(tz: string, offset: number, base: Date = new Date()): Date {
  const { y, m, d } = localParts(base, tz)
  return new Date(Date.UTC(y, m - 1, d + offset, 12, 0, 0, 0))
}

/** Parse a YYYY-MM-DD the agenda was routed with. Midday, so no zone flips it. */
export function fromDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
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

export function weekdayDateIn(iso: string, locale: Locale, tz: string): string {
  return new Date(iso).toLocaleDateString(tag(locale), {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
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
