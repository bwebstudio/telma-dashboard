import {
  areaCodeFor,
  countryOfRegion,
  DIAL_CODE,
  NATIONAL_DIGITS,
  regionLabel,
  type Country,
} from './catalog'

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
  /** True when this is the line every forwarding clinic shares, rather than a
   *  number bought for this clinic. It is nobody's to give back: releasing it
   *  on a rollback would delete the only line we have. */
  shared?: boolean
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

  // ── A PRATELEIRA, ANTES DE PERGUNTAR À TWILIO ────────────────────────────
  // Portugal e Espanha não se compram pela API: a Twilio confirmou por
  // escrito que é limitação da plataforma, que não há API para submeter nem
  // acompanhar pedidos, e que Portugal demora 3 a 5 dias úteis.
  //
  // O que há é isto: um bundle aprovado serve para mais números do mesmo
  // tipo e país. Encomendamos em lote, guardamos, e a inscrição tira um da
  // prateleira. A espera passa a ser nossa e deixa de ser do cliente.
  //
  // Primeiro da região da clínica, depois qualquer um do país. Um número de
  // Madrid numa clínica de Málaga é melhor do que nenhum, e pior do que o de
  // Málaga: por isso é a segunda escolha e não a única.
  const fromShelf = await claimFromStock(country, areaCode, region)
  if (fromShelf) return fromShelf

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
  // ── NEVER THE SHARED LINE ────────────────────────────────────────────────
  // A sign-up that fails half way gives its number back, which is right for a
  // number bought for that clinic and catastrophic for the one every other
  // clinic forwards to: Twilio will not sell this account another Portuguese
  // number, so deleting it takes the product off the air for everybody and
  // there is no undo. Checked here, against the database, rather than trusting
  // every caller to remember.
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data } = await admin
      .from('phone_stock')
      .select('number')
      .eq('provider_ref', sid)
      .eq('shared', true)
      .maybeSingle()
    if (data) {
      console.warn('[twilio] refused to release the shared line', sid)
      return
    }
  } catch (e) {
    // Cannot tell whether it is shared, so do not delete it. A number left
    // alive costs a few euros a month; the other mistake has no price.
    console.error('[twilio] could not check whether the number is shared; keeping it', e)
    return
  }
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
    { method: 'DELETE', headers: { Authorization: auth() } }
  )
}

/**
 * Takes a number off the shelf, if there is one.
 *
 * Claimed by writing the clinic onto the row, which is also what stops two
 * sign-ups a second apart from being handed the same line: the update is
 * conditional on the row still being free, and the one that loses sees no
 * rows changed and moves on.
 *
 * The clinic id is not known yet at this point -- the row does not exist --
 * so the claim marks it taken with a timestamp and the sign-up writes the id
 * afterwards. A number claimed and never attached is visible in the stock
 * listing as taken by nobody, which is the state somebody should go and look
 * at, not one the code should silently reuse.
 */
async function claimFromStock(
  country: Country,
  areaCode: string,
  region: string
): Promise<ProvisionedNumber | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  for (const where of [{ country, region }, { country }]) {
    const query = admin
      .from('phone_stock')
      .select('id, number, provider_ref')
      .is('clinic_id', null)
      .is('claimed_at', null)
      // ── THE SHARED LINE IS NOT STOCK ──────────────────────────────────
      // It is on this shelf because that is where numbers live, and it is
      // the one row that must never be handed to anybody: every clinic that
      // keeps its own number forwards to it, and the routing tells them
      // apart by the number the call came from.
      //
      // Without this, a clinic asking for a number of its own took it. It
      // would have been told the shared line was its own, published it, and
      // the row would have been marked claimed underneath every clinic
      // already forwarding to it. Nothing in the database stops that: the
      // unique index on an exclusive line does not see the shared row,
      // because it is excluded by the very flag this now reads.
      .eq('shared', false)
      .eq('country', where.country)
    if ('region' in where && where.region) query.eq('region', where.region)

    const { data } = await query.limit(1).maybeSingle()
    if (!data) continue

    const { data: claimed } = await admin
      .from('phone_stock')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', (data as { id: string }).id)
      .is('claimed_at', null)
      .select('number, provider_ref')
      .maybeSingle()

    if (claimed) {
      const row = claimed as { number: string; provider_ref: string }
      return { number: row.number, sid: row.provider_ref, demo: false }
    }
  }
  return null
}

/** Attaches a claimed line to the clinic that was being created. */
export async function attachStockToClinic(providerRef: string, clinicId: string): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  await admin
    .from('phone_stock')
    .update({ clinic_id: clinicId })
    .eq('provider_ref', providerRef)
    .is('clinic_id', null)
}

/**
 * The line every clinic that keeps its own number forwards to.
 *
 * Not bought here and not claimed: it is a row in `phone_stock` marked
 * `shared`, which means it stays on the shelf for ever because it serves
 * everybody. Null when the country has none, and then the caller falls back to
 * buying, which is the behaviour this replaced rather than removed.
 *
 * Why this is safe, when two clinics on one number used to be the thing the
 * schema most wanted to prevent: a forwarded call carries the number it was
 * originally dialled on, so /api/voice/incoming knows whose call it is before
 * the agent answers. What it does not cover is a call dialled straight at this
 * line, and that is why exactly one clinic may claim those. See 0059.
 */
export async function sharedLineFor(country: Country): Promise<ProvisionedNumber | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data } = await admin.rpc('shared_line_for', { p_country: country })
  const row = (data as Array<{ number: string; provider_ref: string }> | null)?.[0]
  if (!row?.number || !row.provider_ref) return null
  return { number: row.number, sid: row.provider_ref, demo: false, shared: true }
}
