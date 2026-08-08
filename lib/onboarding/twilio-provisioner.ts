import { areaCodeFor, countryOfRegion, DIAL_CODE, NATIONAL_DIGITS, regionLabel } from './catalog'

/**
 * Buying the number a clinic's patients will ring.
 *
 * Twilio has no SDK in this project and does not need one: two REST calls with
 * `fetch` is the whole of it, and a dependency that exists to save eight lines
 * is a dependency that has to be kept current for years.
 *
 * The demo path is not a mock in the testing sense. It is how this runs until
 * the Twilio account is funded, and it is what makes the sign-up demonstrable
 * to the first client without spending a euro on a number nobody will dial.
 */

export interface ProvisionedNumber {
  /** E.164, as everything downstream expects it. */
  number: string
  /** Twilio's identifier for the number, or a demo id. Kept so a number can be
   *  released later without searching Twilio for it by digits. */
  sid: string
  /** True when no number was actually bought. The clinic is created either way;
   *  this is what tells the internal team the line is not live yet. */
  demo: boolean
}

export class ProvisioningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProvisioningError'
  }
}

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const VOICE_WEBHOOK = process.env.TWILIO_VOICE_WEBHOOK_URL

/** Configured means both halves of the credential are present. Half a
 *  credential is a misconfiguration and must not silently fall back to demo. */
export function twilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN)
}

function auth(): string {
  return 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
}

async function twilio(path: string, body?: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: auth(),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
    cache: 'no-store',
  })

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    // Twilio's own message is far more useful than the status code: "not
    // enough funds", "no numbers available in that area code", "unverified
    // account". Pass it through rather than flattening it to "failed".
    const detail = typeof payload.message === 'string' ? payload.message : `HTTP ${res.status}`
    throw new ProvisioningError(detail)
  }
  return payload
}

/**
 * Finds and buys a local number in the clinic's own region, in its own country.
 *
 * The area code matters to the patient, not to us: a clinic in Málaga answering
 * on a Madrid number reads as a call centre, which is precisely the impression
 * Telma is sold to avoid. When no number exists in that region, this fails
 * loudly rather than quietly buying one somewhere else, because a wrong number
 * that works is harder to notice than one that never arrived.
 */
export async function provisionTwilioNumber(region: string): Promise<ProvisionedNumber> {
  const areaCode = areaCodeFor(region)
  // The region says which country it is in, so nothing has to pass the two
  // together and risk them disagreeing. Buying a Portuguese number for a clinic
  // in Madrid is not a small mistake: it is the number on their door.
  const country = countryOfRegion(region)

  if (!twilioConfigured()) {
    // A number shaped exactly like the real thing, so nothing downstream can
    // tell the difference and then break the day the real one arrives: the
    // country's dial code, then its national digit count, of which the first
    // two or three are the region's. The uuid in the sid is what keeps two demo
    // sign-ups from colliding on the unique index over `phone_provider_ref`.
    const subscriber = Array.from(
      { length: NATIONAL_DIGITS[country] - areaCode.length },
      () => Math.floor(Math.random() * 10)
    ).join('')
    return {
      number: `${DIAL_CODE[country]}${areaCode}${subscriber}`,
      sid: `PNdemo${crypto.randomUUID().replace(/-/g, '').slice(0, 26)}`,
      demo: true,
    }
  }

  const search = (await twilio(
    `/AvailablePhoneNumbers/${country}/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&PageSize=1`
  )) as { available_phone_numbers?: Array<{ phone_number: string }> }

  const candidate = search.available_phone_numbers?.[0]?.phone_number
  if (!candidate) {
    throw new ProvisioningError(
      `Sem números disponíveis com o indicativo ${areaCode} em ${regionLabel(region)} (${country}).`
    )
  }

  const body = new URLSearchParams({ PhoneNumber: candidate })
  // Point it at the voice platform in the same call that buys it. A number that
  // exists but rings nowhere is worse than no number: the clinic hands it out.
  if (VOICE_WEBHOOK) {
    body.set('VoiceUrl', VOICE_WEBHOOK)
    body.set('VoiceMethod', 'POST')
  }

  const bought = (await twilio('/IncomingPhoneNumbers.json', body)) as {
    phone_number?: string
    sid?: string
  }

  if (!bought.phone_number || !bought.sid) {
    throw new ProvisioningError('A Twilio aceitou a compra mas não devolveu o número.')
  }

  return { number: bought.phone_number, sid: bought.sid, demo: false }
}

/**
 * Hands the number back.
 *
 * Called when the clinic row could not be written after the number was bought.
 * Without it, a failed sign-up leaves a number billed monthly to an account
 * nobody is watching, and the only trace of it is in a log line.
 */
export async function releaseTwilioNumber(sid: string): Promise<void> {
  if (!twilioConfigured() || sid.startsWith('PNdemo')) return
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
    { method: 'DELETE', headers: { Authorization: auth() } }
  )
}
