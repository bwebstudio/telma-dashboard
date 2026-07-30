import type { CrmCountry } from './types'

// Reps write numbers the way they were given to them: "912 345 678",
// "21 722 8100", "+351 21 000 00 00", "00 34 91 ...".
//
// Every one of those has to dial. Domingos works Portuguese clinics from a
// Spanish phone, so a bare national number ("21 722 8100") simply does not
// connect: the network has no idea which country it belongs to. So anything
// stored or dialled goes out in international form, using the country the
// clinic is in.

const DIAL_CODE: Record<CrmCountry, string> = { PT: '351', ES: '34' }

/** Digits only, with the country code, no plus. What wa.me wants. */
export function internationalDigits(
  phone: string | null,
  country: CrmCountry
): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null

  if (phone.trim().startsWith('+')) {
    // Already international.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith(DIAL_CODE[country]) && digits.length > 9) {
    // Written as "351 21 ..." without a plus.
  } else {
    digits = DIAL_CODE[country] + digits
  }
  return digits
}

/**
 * The number as it should be stored and shown: the original spacing the rep is
 * used to reading, with the country code in front. "21 722 8100" in Portugal
 * becomes "+351 21 722 8100".
 */
export function normalisePhone(
  phone: string | null | undefined,
  country: CrmCountry
): string | null {
  const raw = (phone ?? '').trim()
  if (!raw) return null
  if (!raw.replace(/\D/g, '')) return null

  if (raw.startsWith('+')) return raw
  if (raw.replace(/\D/g, '').startsWith('00')) {
    return '+' + raw.replace(/^\D*00\s*/, '')
  }
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith(DIAL_CODE[country]) && digits.length > 9) {
    return '+' + raw
  }
  return `+${DIAL_CODE[country]} ${raw}`
}

export function telHref(phone: string | null, country: CrmCountry): string | null {
  const digits = internationalDigits(phone, country)
  return digits ? `tel:+${digits}` : null
}

// wa.me needs the full international number with no plus and no spaces.
export function waHref(phone: string | null, country: CrmCountry): string | null {
  const digits = internationalDigits(phone, country)
  return digits ? `https://wa.me/${digits}` : null
}
