import type { CrmCountry } from './types'

// Which zone a rep works in. The arithmetic itself lives in lib/time.ts, shared
// with the clinic panel: Domingos is in Lisbon and Sonia in Madrid, and those
// two are not the same hour.
export const TZ_BY_COUNTRY: Record<CrmCountry, string> = {
  PT: 'Europe/Lisbon',
  ES: 'Europe/Madrid',
}

export function tzFor(country: CrmCountry | null | undefined): string {
  return TZ_BY_COUNTRY[country ?? 'PT'] ?? 'Europe/Lisbon'
}

export {
  endOfDayIn,
  startOfDayIn,
  isSameDayIn,
  timeIn,
  dateIn,
  dateTimeIn,
  smartStamp,
  lateness,
} from '@/lib/time'
