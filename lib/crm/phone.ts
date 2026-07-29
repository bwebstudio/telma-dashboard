import type { CrmCountry } from './types'

// Reps write numbers the way they were given to them: "912 345 678",
// "+351 21 000 00 00", "00 34 91 ...". Dialling has to work from any of those.

const DIAL_CODE: Record<CrmCountry, string> = { PT: '351', ES: '34' }

export function telHref(phone: string | null): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

// wa.me needs the full international number with no plus and no spaces. A bare
// national number is completed with the country the clinic is in.
export function waHref(phone: string | null, country: CrmCountry): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null

  if (phone.trim().startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.length <= 9) {
    digits = DIAL_CODE[country] + digits
  }
  return `https://wa.me/${digits}`
}
