// The arithmetic of buying something, and the codes that change it.
//
// Isomorphic on purpose: the modal needs it to show a running total as the
// clinic types, and the server needs it to decide what to actually charge. One
// implementation, so the number on the button is the number on the receipt.
//
// Nothing here is authoritative. The browser's copy is a preview; what gets
// charged is what the server computes when the form is submitted, from the
// catalogue price it reads itself. A tampered client can show itself any total
// it likes and still be billed correctly.

export interface CouponDefinition {
  code: string
  discount_percent: number
  label: string
  /** YYYY-MM-DD. Undefined means it does not expire. */
  expires_at?: string
}

// Hardcoded for the MVP: there is no coupon administration, and the two codes
// that exist were agreed by hand. The shape is the shape a `coupons` table
// would have, so moving this to a query later changes this file and nothing
// else. Codes are not secrets: a clinic types one in, and the discount is
// applied by the server either way.
export const COUPONS: CouponDefinition[] = [
  { code: 'WELCOME10', discount_percent: 10, label: 'Boas-vindas' },
  { code: 'PARTNER20', discount_percent: 20, label: 'Parceiro' },
]

// Announced before they are live. They are in the catalogue at 0 EUR so the
// panel can show what is coming, and refused at the till so nobody activates a
// language Telma cannot speak yet. Moves to a column on `addons` the day one of
// them ships and the other does not.
export const COMING_SOON: string[] = ['language_en', 'language_es']

export function normalizeCoupon(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}

/** The coupon behind a code, or null. Expired codes come back null. */
export function findCoupon(raw: string | null | undefined, today = todayKey()): CouponDefinition | null {
  const code = normalizeCoupon(raw)
  if (!code) return null
  const coupon = COUPONS.find((c) => c.code === code)
  if (!coupon) return null
  if (coupon.expires_at && coupon.expires_at < today) return null
  return coupon
}

export interface Quote {
  unit_price_eur: number
  quantity: number
  total_price_eur: number
  coupon: string | null
  /** True only when a code was typed and it was a real one. */
  coupon_valid: boolean
  /** True when something was typed and it was not a code. Drives the hint. */
  coupon_rejected: boolean
  discount_percent: number
  discount_eur: number
  final_price_eur: number
}

/** What this costs: line total, discount, and what is left to pay. */
export function quotePurchase(
  unitPriceEur: number,
  quantity: number,
  rawCoupon?: string | null
): Quote {
  const qty = Math.max(1, Math.floor(quantity) || 1)
  const total = round2(unitPriceEur * qty)
  const typed = normalizeCoupon(rawCoupon)
  const coupon = findCoupon(typed)

  const discountPercent = coupon?.discount_percent ?? 0
  const discount = discountPercent > 0 ? round2((total * discountPercent) / 100) : 0

  return {
    unit_price_eur: unitPriceEur,
    quantity: qty,
    total_price_eur: total,
    coupon: coupon?.code ?? null,
    coupon_valid: Boolean(coupon),
    coupon_rejected: typed.length > 0 && !coupon,
    discount_percent: discountPercent,
    discount_eur: discount,
    // Never negative: a coupon worth more than the cart brings the price to
    // zero, it does not owe the clinic money.
    final_price_eur: Math.max(0, round2(total - discount)),
  }
}

// What the panel offers ------------------------------------------------------
// View models, shared by the server that fills them and the components that
// draw them.

export interface MinutePackOffer {
  id: string
  name: string
  minutes: number
  price_eur: number
  /** What the same minute costs bought loose, for the comparison. */
  unit_price_eur: number
}

/**
 * Why an add-on's button says what it says.
 *
 * 'included' is not 'active': analytics comes free with Rede and is in nobody's
 * add-on list, and telling that clinic to buy it would be selling it something
 * it already has. 'unavailable' is not 'soon' either: one is a plan away, the
 * other is a release away, and the clinic can act on the first.
 */
export type AddonState = 'active' | 'included' | 'buyable' | 'soon' | 'unavailable'

export interface AddonOffer {
  id: string
  name: string
  description: string | null
  price_monthly_eur: number
  state: AddonState
}

export function addonStateFor(
  addon: { id: string; feature_unlock: string; compatible_with: string[] },
  planId: string,
  planFeatures: Record<string, boolean | undefined>,
  activeAddons: string[]
): AddonState {
  if (activeAddons.includes(addon.id)) return 'active'
  if (planFeatures[addon.feature_unlock] === true) return 'included'
  if (addon.compatible_with.length > 0 && !addon.compatible_with.includes(planId)) {
    return 'unavailable'
  }
  if (COMING_SOON.includes(addon.id)) return 'soon'
  return 'buyable'
}

/** How much of the allowance is gone, capped at 100 so the bar cannot overflow. */
export function percentUsed(used: number, allowance: number): number {
  if (allowance <= 0) return 0
  return Math.min(100, Math.round((used / allowance) * 100))
}

/**
 * The tone the bar and the figures carry.
 *
 * Amber at 80% is a nudge with a month left to act on it; red only once the
 * minutes are actually gone. Colouring the last fifth red would put the panel
 * in alarm for a week every month, and a warning that is always on is a
 * warning nobody reads.
 */
export function usageTone(percent: number, exhausted: boolean): 'ok' | 'warn' | 'danger' {
  if (exhausted) return 'danger'
  return percent >= 80 ? 'warn' : 'ok'
}

// Money is stored to the cent. Rounding at every step keeps the receipt's
// arithmetic addable: total - discount = final, with no trailing thousandth.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
