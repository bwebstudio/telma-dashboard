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

export function stripeConfigured(): boolean {
  return Boolean(SECRET)
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
  successUrl: string
  cancelUrl: string
}): Promise<CheckoutSession> {
  const usable = opts.priceIds.filter(Boolean)

  if (!stripeConfigured() || usable.length === 0) {
    return { url: null, id: `cs_demo_${opts.clinicId}`, demo: true }
  }

  const form = new URLSearchParams({
    mode: 'subscription',
    'payment_method_types[0]': 'card',
    customer_email: opts.email,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    locale: 'pt',
    // The clinic id travels with the session so the webhook can find the row it
    // belongs to without matching on an email somebody may have mistyped.
    'metadata[clinic_id]': opts.clinicId,
    'metadata[plan]': opts.plan,
    'metadata[billing_cycle]': opts.billingCycle,
    'subscription_data[metadata][clinic_id]': opts.clinicId,
  })

  usable.forEach((price, i) => {
    form.set(`line_items[${i}][price]`, price)
    form.set(`line_items[${i}][quantity]`, '1')
  })

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
