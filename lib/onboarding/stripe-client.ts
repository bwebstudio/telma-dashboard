import type { BillingCycle, PlanType } from '@/lib/types'

/**
 * Taking the first payment.
 *
 * Two decisions worth stating, because both differ from the obvious reading of
 * the brief.
 *
 * The card form is Stripe's, not ours. The brief asked for a card form inside
 * step 6; this uses hosted Checkout instead. A card field rendered by us, even
 * through Stripe Elements, drags this app into PCI scope and puts three more
 * client dependencies on a page whose job is to not break. Redirecting to
 * Stripe means the card details never touch our DOM, our logs or our server,
 * and it is the flow Stripe itself recommends for a subscription sign-up.
 *
 * There is no SDK. The `stripe` package is 4MB to make two POST requests with
 * form encoding. `fetch` does it, and the API version is then pinned by us
 * rather than by whenever the package was last updated.
 */

export interface CheckoutSession {
  /** Where to send the browser. Null in demo mode: there is nowhere to send it. */
  url: string | null
  id: string
  demo: boolean
}

export class PaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentError'
  }
}

const SECRET = process.env.STRIPE_SECRET_KEY
const API = 'https://api.stripe.com/v1'
// Pinned. An account whose default version moves must not change what this
// code receives without somebody choosing that.
const API_VERSION = '2024-06-20'

/**
 * THE TWO TAX RATES, BY ENVIRONMENT AND NOT BY CONSTANT.
 *
 * Tax rate ids change between test mode and live, exactly like price ids, and
 * unlike prices they cannot carry a lookup key — so there is no way to find
 * them by name. They come from the environment instead, which makes the move
 * to live a Vercel setting rather than a code change somebody has to remember.
 *
 *   STRIPE_TAX_RATE_PT   IVA 23%, applied to clinics in Portugal
 *   STRIPE_TAX_RATE_ES   reverse charge at 0%, for Spanish clinics
 *
 * Unset means no rate is applied and the invoice goes out without VAT, which
 * is wrong in both countries — so `checkoutTaxRate` says so in the log rather
 * than failing the sign-up, because a clinic that cannot subscribe is worse
 * than an invoice that needs correcting.
 */
const TAX_RATE: Partial<Record<'PT' | 'ES', string | undefined>> = {
  PT: process.env.STRIPE_TAX_RATE_PT,
  ES: process.env.STRIPE_TAX_RATE_ES,
}

/**
 * Whether Stripe works the tax out itself.
 *
 * Off unless asked. It has a price and it has a prerequisite: the account
 * needs Stripe Tax switched on with a Portuguese registration, and without
 * that every checkout session is refused. So it is a thing somebody turns on
 * deliberately, after doing the other half.
 */
export function automaticTax(): boolean {
  return process.env.STRIPE_AUTOMATIC_TAX === '1'
}

function checkoutTaxRate(country: 'PT' | 'ES'): string | null {
  const id = TAX_RATE[country]
  if (!id) {
    console.error(`[stripe] no tax rate configured for ${country}; invoicing without VAT`)
    return null
  }
  return id
}

/**
 * What Stripe will actually charge, before anybody is asked to agree to it.
 *
 * The `plans` table has prices too, and they are not the same fact. That table
 * is what the site advertises; these are what the card is debited. They are
 * kept in step by hand, and a summary screen built from the advertised number
 * would be a promise the checkout is free to break. So the screen that says
 * "this is what you will pay" asks the thing that does the charging.
 */
export interface QuotedPrice {
  id: string
  /** Minor units, as Stripe stores them. */
  amount: number
  currency: string
  interval: 'month' | 'year' | null
}

export async function quotesByLookupKey(keys: string[]): Promise<Map<string, QuotedPrice>> {
  const found = new Map<string, QuotedPrice>()
  if (!stripeConfigured() || keys.length === 0) return found

  const qs = new URLSearchParams({ active: 'true', limit: '100' })
  keys.forEach((k, i) => qs.set(`lookup_keys[${i}]`, k))

  const res = (await stripeGet(`/prices?${qs}`)) as {
    data?: {
      id?: string
      lookup_key?: string
      unit_amount?: number | null
      currency?: string
      recurring?: { interval?: string } | null
    }[]
  }
  for (const p of res.data ?? []) {
    if (!p.lookup_key || !p.id || typeof p.unit_amount !== 'number') continue
    const interval = p.recurring?.interval
    found.set(p.lookup_key, {
      id: p.id,
      amount: p.unit_amount,
      currency: (p.currency ?? 'eur').toUpperCase(),
      interval: interval === 'month' || interval === 'year' ? interval : null,
    })
  }
  return found
}

/**
 * The tax that will be added, read from the rate the checkout will use.
 *
 * Not a percentage written here. The rate lives in Stripe, differs between
 * test and live, and is the kind of number that gets changed by somebody in a
 * dashboard on a Tuesday. A screen that quotes it from memory is a screen
 * that will one day quote the old one.
 */
export interface QuotedTax {
  id: string
  /** 23 for twenty-three per cent. Zero is a real answer: reverse charge. */
  percentage: number
  displayName: string
  description: string | null
  /** True when the rate is 0 because the buyer accounts for the VAT itself. */
  reverseCharge: boolean
}

export async function taxQuoteFor(country: 'PT' | 'ES'): Promise<QuotedTax | null> {
  const id = TAX_RATE[country]
  if (!id || !stripeConfigured()) return null
  try {
    const r = (await stripeGet(`/tax_rates/${id}`)) as {
      id?: string
      percentage?: number
      display_name?: string
      description?: string | null
    }
    const percentage = typeof r.percentage === 'number' ? r.percentage : 0
    return {
      id: r.id ?? id,
      percentage,
      displayName: r.display_name ?? 'IVA',
      description: r.description ?? null,
      reverseCharge: percentage === 0,
    }
  } catch {
    // A rate that cannot be read is not a reason to refuse a sign-up. The
    // summary says the tax is worked out at payment instead of inventing one.
    return null
  }
}

export function stripeConfigured(): boolean {
  return Boolean(SECRET)
}

/**
 * The same call, read-only.
 *
 * Stripe's API takes query parameters on GET and a form body on POST, so the
 * two cannot share one function without the caller having to know which it is.
 * This one exists for `pricesByLookupKey` below and nothing else.
 */
async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Stripe-Version': API_VERSION,
    },
    cache: 'no-store',
  })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
  } & Record<string, unknown>
  if (!res.ok) {
    throw new PaymentError(payload.error?.message ?? `Stripe respondeu ${res.status}.`)
  }
  return payload
}

/**
 * PRICES ARE FOUND BY NAME, NOT BY STORED ID.
 *
 * A lookup key is a label we choose — `clinica_annual` — that Stripe keeps
 * attached to a price. It is the same label in test mode and in live mode,
 * while the price id behind it is not: moving to live means every id changes.
 *
 * Storing ids in the database therefore means repopulating a table on the day
 * of launch, and forgetting to means every checkout fails at the moment the
 * first real clinic tries to pay. Resolving by name costs one request per
 * sign-up and cannot be forgotten.
 *
 * Unknown keys come back missing rather than wrong: Stripe returns only what
 * it finds, and the caller checks the count.
 */
export async function pricesByLookupKey(keys: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  if (!stripeConfigured() || keys.length === 0) return found

  const qs = new URLSearchParams({ active: 'true', limit: '100' })
  keys.forEach((k, i) => qs.set(`lookup_keys[${i}]`, k))

  const res = (await stripeGet(`/prices?${qs}`)) as {
    data?: { id?: string; lookup_key?: string }[]
  }
  for (const price of res.data ?? []) {
    if (price.lookup_key && price.id) found.set(price.lookup_key, price.id)
  }
  return found
}

async function stripe(
  path: string,
  form: URLSearchParams,
  idempotencyKey?: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': API_VERSION,
      // A retried sign-up must not become two subscriptions. Stripe returns the
      // original response for a repeated key rather than charging again.
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: form,
    cache: 'no-store',
  })

  const payload = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
  } & Record<string, unknown>

  if (!res.ok) {
    throw new PaymentError(payload.error?.message ?? `Stripe respondeu ${res.status}.`)
  }
  return payload
}

/**
 * The subscription checkout for a new clinic.
 *
 * `priceId` comes from `plans.stripe_price_id` in the database, which is null
 * until the products exist in Stripe. Null is not an error here: it is the
 * state this runs in today, and it takes the demo path so the sign-up still
 * completes. What it must never do is invent a price.
 */
export async function createCheckoutSession(opts: {
  clinicId: string
  clinicName: string
  email: string
  plan: PlanType
  billingCycle: BillingCycle
  /** Stripe price ids: the plan, plus any add-on bought at sign-up. */
  priceIds: string[]
  /** Decides the VAT treatment. Comes from the clinic's region. */
  country: 'PT' | 'ES'
  /**
   * Days before the first charge. Zero for everybody except a clinic that
   * arrived through an implementation link.
   *
   * Not a discount and deliberately not written as one: the invoice simply
   * starts a week later, with no line saying somebody was given something.
   * Stripe still takes the card now, so the first charge goes out by itself
   * and nobody has to chase a clinic on the seventh day.
   */
  trialDays?: number
  /** The language the sign-up was read in. Only the page's language: it
   *  changes no amount and no tax. */
  locale: 'pt' | 'es'
  successUrl: string
  cancelUrl: string
}): Promise<CheckoutSession> {
  const usable = opts.priceIds.filter(Boolean)

  if (!stripeConfigured() || usable.length === 0) {
    return { url: null, id: `cs_demo_${opts.clinicId}`, demo: true }
  }

  const form = new URLSearchParams({
    mode: 'subscription',
    // No payment_method_types. Pinning it to card hid every other method the
    // account has switched on — SEPA and Google Pay were enabled in the
    // dashboard and never appeared. Left out, Stripe offers what the account
    // allows and what the buyer's country supports, which is the whole point
    // of enabling them there.
    customer_email: opts.email,
    // Both needed for an invoice that stands up: the address decides the VAT
    // treatment, and the tax id is the NIF-IVA a Spanish clinic needs on it.
    billing_address_collection: 'required',
    'tax_id_collection[enabled]': 'true',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // The sign-up's own language. It was fixed to Portuguese, so a clinic that
    // signed up in Spanish paid on a Portuguese page.
    locale: opts.locale === 'es' ? 'es' : 'pt',
    // The clinic id travels with the session so the webhook can find the row it
    // belongs to without matching on an email somebody may have mistyped.
    'metadata[clinic_id]': opts.clinicId,
    'metadata[plan]': opts.plan,
    'metadata[billing_cycle]': opts.billingCycle,
    'subscription_data[metadata][clinic_id]': opts.clinicId,
    // The promotion code box on Stripe's own page. Ours to switch on, theirs
    // to render, validate and total up: a code typed into our form would have
    // to be re-checked here anyway, and the figure the reader needs to see is
    // the one on the page where the card goes in.
    allow_promotion_codes: 'true',
  })

  // ── TWO WAYS TO WORK OUT THE TAX, AND ONLY ONE OF THEM CHECKS THE NIF ──
  // The fixed rate is applied by country: Portugal pays 23%, Spain is
  // reverse-charged at 0%. It is right for a Spanish clinic with a valid
  // VIES number and wrong for one without, because the reverse charge needs
  // that number to exist. We collect it on Stripe's page but cannot act on
  // it, since the rate is chosen here, before the clinic has typed it.
  //
  // Stripe Tax chooses the rate after the number is typed and validated,
  // which is the only way the two cases can come out differently. It costs
  // 0.5% of what it processes, so it is a decision and not a default: unset,
  // nothing changes. Turn it on in Stripe first -- Settings, Tax, with a
  // Portuguese registration -- or every session is refused.
  if (opts.trialDays && opts.trialDays > 0) {
    form.set('subscription_data[trial_period_days]', String(Math.floor(opts.trialDays)))
  }

  if (automaticTax()) {
    form.set('automatic_tax[enabled]', 'true')
    // Stripe needs the address to decide, and the clinic's own country to
    // know whether the charge reverses. Both are already collected above.
    usable.forEach((price, i) => {
      form.set(`line_items[${i}][price]`, price)
      form.set(`line_items[${i}][quantity]`, '1')
    })
  } else {
    const taxRate = checkoutTaxRate(opts.country)
    usable.forEach((price, i) => {
      form.set(`line_items[${i}][price]`, price)
      form.set(`line_items[${i}][quantity]`, '1')
      if (taxRate) form.set(`line_items[${i}][tax_rates][0]`, taxRate)
    })
  }

  const session = (await stripe('/checkout/sessions', form, `signup_${opts.clinicId}`)) as {
    id?: string
    url?: string
  }

  if (!session.id || !session.url) {
    throw new PaymentError('A Stripe não devolveu uma sessão de pagamento.')
  }
  return { url: session.url, id: session.id, demo: false }
}

/**
 * Verifies a webhook actually came from Stripe.
 *
 * Written out rather than imported because the SDK is not here, and because the
 * check is short enough to read: the header carries a timestamp and one or more
 * v1 signatures, each the HMAC-SHA256 of `timestamp.body` under the endpoint
 * secret. An unverified webhook endpoint is an unauthenticated write to the
 * billing state of every clinic, so this returns false on anything it cannot
 * prove, including its own misconfiguration.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  toleranceSeconds = 300
): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !header) return false

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i), p.slice(i + 1)]
    })
  )
  const timestamp = Number(parts.t)
  if (!Number.isFinite(timestamp)) return false

  // A replayed webhook from last week must not be accepted as news.
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false

  const signatures = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3))
  if (!signatures.length) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  )
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return signatures.some((sig) => timingSafeEqual(sig, expected))
}

/** Constant time compare. A fast `===` on a signature leaks it one byte at a
 *  time to anyone willing to measure. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * A door into the clinic's own billing, hosted by Stripe and wearing our name.
 *
 * ── WHY NOT BUILD THE SCREEN ──────────────────────────────────────────────
 * Invoices are a legal document and a moving target: credit notes, tax ids,
 * proration when somebody changes plan mid-month, the VAT line that depends
 * on a number validated at checkout. Stripe already renders all of it, keeps
 * it for seven years and will keep it correct when the rules change. A table
 * of our own would be a second version of the truth, and the first time the
 * two disagreed it would be in front of an accountant.
 *
 * The portal also carries the payment method and the cancellation, which are
 * the other two things a clinic goes looking for and the two we would
 * otherwise have to build and guard.
 *
 * It is branded in the Stripe dashboard, so what the clinic sees is Telma.
 * The customer-facing copy never says Stripe for the same reason it does not
 * say which bank we use: it is ours to deal with, not theirs.
 */
export async function billingPortalUrl(
  customerId: string,
  returnTo: string
): Promise<string | null> {
  if (!stripeConfigured() || !customerId) return null
  const form = new URLSearchParams({ customer: customerId, return_url: returnTo })
  try {
    const session = (await stripe('/billing_portal/sessions', form)) as { url?: string }
    return session.url ?? null
  } catch (e) {
    // A clinic that cannot reach its invoices is a support email, not a
    // reason for the account page to fail to render.
    console.error('[stripe] billing portal', e)
    return null
  }
}

// ── STOPPING, AND STARTING AGAIN ────────────────────────────────────────────
// Everything below changes an existing subscription rather than creating one.
// None of it deletes anything at Stripe: a cancelled subscription keeps its
// invoices, which is what the tax authorities of both countries require and
// what a clinic asking for its data back is told.

/** When the clinic has paid up to. Null when Stripe does not know it. */
export async function subscriptionPeriodEnd(subscriptionId: string): Promise<string | null> {
  if (!stripeConfigured() || !subscriptionId) return null
  try {
    const sub = (await stripeGet(`/subscriptions/${subscriptionId}`)) as {
      current_period_end?: number
    }
    return sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
  } catch (e) {
    console.error('[stripe] period end', e)
    return null
  }
}

/**
 * Stop at the end of what was paid for.
 *
 * Not `DELETE /subscriptions/:id`, which stops it now: the clinic paid for
 * these days and also needs them, because cancelling does not undo the
 * forward on its line and its patients would reach an engaged tone the same
 * afternoon. Reversible until the day arrives, which is the whole reason
 * Stripe has this flag rather than a delete.
 */
export async function cancelAtPeriodEnd(subscriptionId: string): Promise<string | null> {
  if (!stripeConfigured() || !subscriptionId) return null
  const sub = (await stripe(
    `/subscriptions/${subscriptionId}`,
    new URLSearchParams({ cancel_at_period_end: 'true' })
  )) as { current_period_end?: number }
  return sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
}

/** Changed their mind, before the day arrived. */
export async function keepSubscription(subscriptionId: string): Promise<void> {
  if (!stripeConfigured() || !subscriptionId) return
  await stripe(
    `/subscriptions/${subscriptionId}`,
    new URLSearchParams({ cancel_at_period_end: 'false' })
  )
}

/**
 * Stop collecting, keep the subscription.
 *
 * `void` and not `keep_as_draft`: the months a clinic is away are months it
 * owes nothing for, and an invoice drafted now is an invoice somebody has to
 * remember to throw away later. The subscription itself stays, which is what
 * keeps the plan, the price agreed and the line.
 */
export async function pauseCollection(subscriptionId: string): Promise<void> {
  if (!stripeConfigured() || !subscriptionId) return
  await stripe(
    `/subscriptions/${subscriptionId}`,
    new URLSearchParams({ 'pause_collection[behavior]': 'void' })
  )
}

/** Back from the pause. Billing resumes on the subscription's own cycle. */
export async function resumeCollection(subscriptionId: string): Promise<void> {
  if (!stripeConfigured() || !subscriptionId) return
  await stripe(`/subscriptions/${subscriptionId}`, new URLSearchParams({ pause_collection: '' }))
}
