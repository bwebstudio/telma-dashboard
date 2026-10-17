'use server'

import { countryOfRegion } from '@/lib/onboarding/catalog'
import {
  quotesByLookupKey,
  taxQuoteFor,
  stripeConfigured,
  automaticTax,
} from '@/lib/onboarding/stripe-client'
import { lookupKeysForQuote } from '@/lib/actions/onboarding'
import type { PlanType } from '@/lib/types'

/**
 * What this sign-up will cost, worked out before the button that charges it.
 *
 * ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
 * The last step used to end on a button that said "sign up" and went straight
 * to Stripe. Somebody paying 249 a month has no way to check, before leaving
 * our site, that 249 is the number, that the add-on they ticked four steps
 * ago is in there, or what the tax will be. Pressing it is an act of faith,
 * and the people least willing to perform it are the ones who read carefully.
 *
 * ── WHY IT ASKS STRIPE AND NOT THE PLANS TABLE ────────────────────────────
 * Both hold prices, and they are different facts. The table is what the site
 * advertises; Stripe is what the card is debited. They are kept in step by
 * hand. A summary built from the advertised number is a promise the checkout
 * is free to break, and it would break it silently, in the one place a client
 * is deciding whether to trust us.
 *
 * ── WHY TAX CAN BE UNKNOWN AND THAT IS ALLOWED ────────────────────────────
 * The rate is an object in Stripe, different between test and live, and
 * editable by a person in a dashboard. When it cannot be read, this says so
 * rather than quoting a percentage from memory: "worked out at payment" is
 * honest, and a number that turns out to be wrong is not.
 */

export interface QuoteLine {
  /** 'plan' or an add-on id, for the label the screen puts beside it. */
  kind: 'plan' | 'whatsapp'
  lookupKey: string
  /** Minor units. */
  amount: number
}

export interface CheckoutQuote {
  ok: boolean
  currency: string
  /** 'month' | 'year', taken from the prices themselves. */
  interval: 'month' | 'year' | null
  lines: QuoteLine[]
  subtotal: number
  /** Null when the rate could not be read: the screen says so. */
  taxPercentage: number | null
  taxLabel: string | null
  taxNote: string | null
  /** True when the rate is zero because the clinic accounts for the VAT. */
  reverseCharge: boolean
  taxAmount: number
  total: number
  country: 'PT' | 'ES'
  /** True when there is nothing to charge here: demo, or a quoted plan. */
  byArrangement: boolean
}

export async function checkoutQuote(input: {
  plan: string
  cycle: string
  whatsapp: boolean
  region: string
}): Promise<CheckoutQuote> {
  const country = countryOfRegion(input.region)
  const cycle = input.cycle === 'annual' ? 'annual' : 'monthly'
  const plan = input.plan as PlanType

  const empty = (byArrangement: boolean): CheckoutQuote => ({
    ok: !byArrangement,
    currency: 'EUR',
    interval: cycle === 'annual' ? 'year' : 'month',
    lines: [],
    subtotal: 0,
    taxPercentage: null,
    taxLabel: null,
    taxNote: null,
    reverseCharge: false,
    taxAmount: 0,
    total: 0,
    country,
    byArrangement,
  })

  const keys = await lookupKeysForQuote(plan, cycle, input.whatsapp)
  if (!keys.length || !stripeConfigured()) return empty(true)

  // With Stripe Tax on, the rate depends on the VAT number the clinic has not
  // typed yet, so there is no honest figure to show here. The screen says the
  // tax is worked out at payment, which is exactly what happens.
  const [prices, tax] = await Promise.all([
    quotesByLookupKey(keys),
    automaticTax() ? Promise.resolve(null) : taxQuoteFor(country),
  ])

  // A missing price is the same failure the checkout would hit, and it is
  // better met here, on a screen that can say so, than on a redirect that
  // ends somewhere unhelpful.
  const missing = keys.filter((k) => !prices.has(k))
  if (missing.length) {
    console.error('[quote] no Stripe price for', missing.join(', '))
    return { ...empty(false), ok: false }
  }

  const lines: QuoteLine[] = keys.map((k) => ({
    kind: k.startsWith('whatsapp_') ? 'whatsapp' : 'plan',
    lookupKey: k,
    amount: prices.get(k)!.amount,
  }))

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0)
  const pct = tax?.percentage ?? null
  // Rounded once over the subtotal, not per line, which is how Stripe
  // computes an exclusive rate over a set of line items.
  const taxAmount = pct === null ? 0 : Math.round((subtotal * pct) / 100)

  return {
    ok: true,
    currency: prices.get(keys[0])!.currency,
    interval: prices.get(keys[0])!.interval,
    lines,
    subtotal,
    taxPercentage: pct,
    taxLabel: tax?.displayName ?? null,
    taxNote: tax?.description ?? null,
    reverseCharge: tax?.reverseCharge ?? false,
    taxAmount,
    total: subtotal + taxAmount,
    country,
    byArrangement: false,
  }
}
