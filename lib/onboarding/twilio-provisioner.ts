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
  /** Why it is a demo number when Twilio was configured and should have sold
   *  one. Null when there was nothing to buy with, which is the ordinary case
   *  before the account is funded. Kept so "the line is not live" comes with
   *  the reason attached instead of somebody going to look for it. */
  unavailable?: string
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

  // A number shaped exactly like the real thing, so nothing downstream can tell
  // the difference and then break the day the real one arrives: the country's
  // dial code, then its national digit count, of which the first two or three
  // are the region's. The uuid in the sid is what keeps two demo sign-ups from
  // colliding on the unique index over `phone_provider_ref`.
  const placeholder = (unavailable?: string): ProvisionedNumber => {
    const subscriber = Array.from(
      { length: NATIONAL_DIGITS[country] - areaCode.length },
      () => Math.floor(Math.random() * 10)
    ).join('')
    return {
      number: `${DIAL_CODE[country]}${areaCode}${subscriber}`,
      sid: `PNdemo${crypto.randomUUID().replace(/-/g, '').slice(0, 26)}`,
      demo: true,
      ...(unavailable ? { unavailable } : {}),
    }
  }

  if (!twilioConfigured()) return placeholder()

  // ── A SIGN-UP DOES NOT FAIL OVER SOMETHING THE CLINIC DID NOT CHOOSE ──────
  // Asking Twilio for a Portuguese local number on this account answers "The
  // requested resource /AvailablePhoneNumbers/PT/Local.json was not found" --
  // there is no such inventory to sell. That used to reach the applicant as
  // "Não foi possível concluir a inscrição", at the end, after six steps, and
  // there is nothing they could have answered differently.
  //
  // Whether Twilio has stock in a country is our problem and not theirs, so it
  // is not their sign-up that breaks. The clinic is created with a placeholder,
  // the row says the line is not live and why, and somebody here sorts the
  // number out. The only thing that must never happen is a clinic believing it
  // has a number that rings.
  let candidate: string | undefined
  try {
    const search = (await twilio(
      `/AvailablePhoneNumbers/${country}/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&PageSize=1`
    )) as { available_phone_numbers?: Array<{ phone_number: string }> }
    candidate = search.available_phone_numbers?.[0]?.phone_number
  } catch (e) {
    return placeholder(e instanceof Error ? e.message : 'A Twilio não respondeu à procura.')
  }

  if (!candidate) {
    return placeholder(
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

  // Buying can fail for reasons that are also ours: no funds, an unverified
  // account, a number taken between the search and the purchase.
  let bought: { phone_number?: string; sid?: string }
  try {
    bought = (await twilio('/IncomingPhoneNumbers.json', body)) as {
      phone_number?: string
      sid?: string
    }
  } catch (e) {
    return placeholder(e instanceof Error ? e.message : 'A Twilio recusou a compra.')
  }

  if (!bought.phone_number || !bought.sid) {
    return placeholder('A Twilio aceitou a compra mas não devolveu o número.')
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
