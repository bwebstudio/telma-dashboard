import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_MINUTES, PLAN_PRICE, EXTRA_MINUTE_PRICE } from '@/lib/plans'
// The month key the meter is written under, in UTC. record_call has used
// `date_trunc('month', now())` since 0009 and now() on Supabase is UTC, so
// reading the clinic's own month here would miss the meter's row for a few
// hours around every month boundary.
import { currentMonthKey } from '@/lib/format'
import {
  COUPONS,
  addonStateFor,
  findCoupon,
  normalizeCoupon,
  round2,
  type AddonOffer,
  type MinutePackOffer,
} from '@/lib/purchase-utils'
import {
  CAPABILITIES,
  type Addon,
  type Capability,
  type Clinic,
  type ClinicUsage,
  type CouponCheck,
  type MetricType,
  type MinutePack,
  type Plan,
  type PlanType,
  type PurchaseType,
} from '@/lib/types'

// What the voice agent needs to know before it opens its mouth, and what the
// checkout needs to know before it charges anything. Server only: every
// function here reaches the database with the service role key.
//
// The rule these all serve: a clinic can do what its plan includes plus what it
// has bought, and can talk for as many minutes as its plan allows plus the ones
// it has paid for on top. Everything below is that sentence, in one place, so
// the panel and the agent cannot answer it differently.

/** The clinic's counters with every key present, whatever the row carries. */
export function clinicUsage(clinic: Clinic): ClinicUsage {
  const raw = clinic.usage_this_month ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  return {
    minutes_used: num(raw.minutes_used),
    extra_minutes_used: num(raw.extra_minutes_used),
    extra_minutes_purchased: num(raw.extra_minutes_purchased),
    whatsapp_messages: num(raw.whatsapp_messages),
    api_calls: num(raw.api_calls),
  }
}

/**
 * The add-ons switched on. Falls back to the old `addon_whatsapp` boolean so a
 * clinic reached before migration 0015 ran still reports the add-on it is
 * paying for.
 */
export function activeAddons(clinic: Clinic): string[] {
  const list = clinic.active_addons ?? []
  if (clinic.addon_whatsapp && !list.includes('whatsapp')) return [...list, 'whatsapp']
  return [...list]
}

// A plan row for a clinic whose plan is not in the `plans` table yet: before
// migration 0014 has run, and in demo mode, which has no database at all. The
// numbers are the same ones the landing sells, from lib/plans.
function fallbackPlan(id: PlanType): Plan {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: null,
    price_monthly_eur: PLAN_PRICE[id],
    price_annual_eur: null,
    max_minutes_per_month: PLAN_MINUTES[id] ?? null,
    max_locations: id === 'essencial' ? 1 : 3,
    max_concurrent_calls: 1,
    price_extra_location_eur: null,
    features: {},
    stripe_price_id: null,
  }
}

export interface MinuteBalance {
  /** Minutes the plan includes. */
  included: number
  /** Minutes added by packs this cycle. */
  purchased: number
  /** included + purchased: what the clinic may actually spend. */
  allowance: number
  /** Minutes spoken this cycle, from the meter. */
  used: number
  /** Never negative. Zero means the clinic is out. */
  remaining: number
  /** Minutes spoken beyond the allowance, billed at `extra_minute_price_eur`. */
  over: number
  exhausted: boolean
  extra_minute_price_eur: number
}

export interface ClinicWithPlan {
  clinic: Clinic
  plan: Plan
  minutes: MinuteBalance
  addons: string[]
  capabilities: Record<Capability, boolean>
}

/**
 * A clinic, the plan it is on, and the arithmetic that follows from both.
 *
 * The one place minutes are reconciled: `usage.minutes` is the meter the voice
 * webhook writes, and it is copied onto the returned clinic's
 * `usage_this_month.minutes_used`. The column in the database is a cache that
 * only this function is trusted to fill, which is why nothing else writes it.
 *
 * Returns null when there is no such clinic. A missing `plans` row is not an
 * error: the plan falls back to the list price, so a clinic is never locked out
 * of its own allowance by a migration that has not run yet.
 */
export async function getClinicWithPlan(clinicId: string): Promise<ClinicWithPlan | null> {
  if (!clinicId) return null
  const admin = createAdminClient()

  const { data: row } = await admin.from('clinics').select('*').eq('id', clinicId).maybeSingle()
  if (!row) return null
  const base = row as Clinic

  const [{ data: planRow }, { data: usageRow }] = await Promise.all([
    admin.from('plans').select('*').eq('id', base.plan).maybeSingle(),
    admin
      .from('usage')
      .select('minutes')
      .eq('clinic_id', clinicId)
      .eq('month', currentMonthKey())
      .maybeSingle(),
  ])

  const plan = (planRow as Plan | null) ?? fallbackPlan(base.plan)
  const metered = Number((usageRow as { minutes?: number } | null)?.minutes ?? 0) || 0

  const clinic: Clinic = {
    ...base,
    usage_this_month: { ...clinicUsage(base), minutes_used: metered },
  }

  return {
    clinic,
    plan,
    minutes: calculateMinutesRemaining(clinic, plan),
    addons: activeAddons(clinic),
    capabilities: capabilitiesFor(clinic, plan),
  }
}

/**
 * How many minutes are left this cycle.
 *
 * Pure arithmetic on what it is handed, so the panel can call it on a clinic it
 * already has without going back to the database. Sync on purpose: awaiting it
 * is harmless if a caller does.
 *
 * `personalizado` has no plan allowance, so it falls back to the negotiated
 * `minute_limit` on the clinic itself, which is where a bespoke number lives.
 */
export function calculateMinutesRemaining(clinic: Clinic, plan: Plan): MinuteBalance {
  const usage = clinicUsage(clinic)
  const included = plan.max_minutes_per_month ?? clinic.minute_limit ?? PLAN_MINUTES[clinic.plan] ?? 0
  const purchased = usage.extra_minutes_purchased
  const allowance = included + purchased
  const used = usage.minutes_used

  return {
    included,
    purchased,
    allowance,
    used,
    remaining: Math.max(0, round2(allowance - used)),
    over: Math.max(0, round2(used - allowance)),
    exhausted: used >= allowance,
    extra_minute_price_eur: EXTRA_MINUTE_PRICE,
  }
}

/**
 * Record something consumed: minutes spoken, a WhatsApp message sent, an API
 * call served.
 *
 * One database call, because the day's history, the month's meter and the live
 * counter have to move together or not at all. `count` accumulates, so calling
 * this twice for the same day adds up rather than overwriting.
 */
export async function trackUsage(
  clinicId: string,
  metricType: MetricType,
  count: number = 1,
  metricDate?: string
): Promise<{ ok: boolean; error?: string; day_total?: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('track_usage', {
    p_clinic_id: clinicId,
    p_metric_type: metricType,
    p_count: Math.round(count),
    ...(metricDate ? { p_metric_date: metricDate } : {}),
  })

  if (error) return { ok: false, error: error.message }
  const result = data as { day_total?: number } | null
  return { ok: true, day_total: result?.day_total }
}

/**
 * Whether a clinic may do something: it bought the add-on, or the plan already
 * includes it.
 *
 * Both halves matter. WhatsApp is only ever an add-on; custom_voice comes free
 * with Clínica and Rede and is in nobody's `active_addons`, so checking the
 * add-on list alone would tell a Clínica it cannot use the voice it pays for.
 *
 * This is the same rule as check_clinic_capability() in migration 0016, which
 * exists for callers reaching Postgres directly. Written here as well because
 * the capabilities endpoint answers nine of these at once and nine round trips
 * at the start of every call is not worth the deduplication. If the rule
 * changes, both move.
 */
export function capabilitiesFor(clinic: Clinic, plan: Plan): Record<Capability, boolean> {
  const addons = activeAddons(clinic)
  const map = {} as Record<Capability, boolean>
  for (const capability of CAPABILITIES) {
    map[capability] = addons.includes(capability) || plan.features?.[capability] === true
  }
  return map
}

export async function validateClinicCapability(
  clinicId: string,
  capability: string
): Promise<boolean> {
  if (!isCapability(capability)) return false
  const context = await getClinicWithPlan(clinicId)
  if (!context) return false
  return context.capabilities[capability]
}

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value)
}

// Coupons --------------------------------------------------------------------
// The catalogue and the arithmetic live in lib/purchase-utils, which the buy
// modal imports too: the total on the button has to be the total on the
// receipt, and two implementations of the same sum eventually disagree. What
// stays here is the server's answer, which is the only one that decides.

/**
 * What a code is worth. Unknown and expired codes are not an error: they are a
 * valid answer of "no discount", which is what the checkout has to show.
 *
 * Async even though nothing is awaited, so that moving the catalogue into a
 * table later changes this function and no caller.
 */
export async function validateCoupon(couponCode: string): Promise<CouponCheck> {
  const code = normalizeCoupon(couponCode)
  if (!code) return { valid: false, discount_percent: 0, reason: 'unknown' }

  const coupon = findCoupon(code)
  if (!coupon) {
    // Known but out of date reads differently from never having existed, and
    // the clinic typing it deserves to be told which.
    const expired = COUPONS.some((c) => c.code === code)
    return {
      valid: false,
      discount_percent: 0,
      code,
      reason: expired ? 'expired' : 'unknown',
    }
  }

  return {
    valid: true,
    discount_percent: coupon.discount_percent,
    code: coupon.code,
    label: coupon.label,
  }
}

/** The euros a coupon takes off a total, and what is left to charge. */
export function applyCoupon(
  totalEur: number,
  coupon: CouponCheck
): { discount_eur: number; discount_percent: number; final_price_eur: number } {
  if (!coupon.valid || coupon.discount_percent <= 0) {
    return { discount_eur: 0, discount_percent: 0, final_price_eur: round2(totalEur) }
  }
  const discount = round2((totalEur * coupon.discount_percent) / 100)
  return {
    discount_eur: discount,
    discount_percent: coupon.discount_percent,
    // Never negative: a coupon worth more than the cart brings the price to
    // zero, it does not owe the clinic money.
    final_price_eur: Math.max(0, round2(totalEur - discount)),
  }
}

// What is for sale -----------------------------------------------------------

export interface PurchasableItem {
  id: string
  name: string
  unit_price_eur: number
  /** Minutes one unit grants. Non-zero only for minute packs. */
  minutes_per_unit: number
  /** Plans this may be bought on. Empty means no restriction. */
  compatible_with: PlanType[]
}

/**
 * The catalogue row behind a purchase, priced at the moment of buying.
 *
 * Read from the database rather than from a constant, because the price on the
 * receipt has to be the price that was on offer, and because add-on and pack
 * prices are meant to be editable without a deploy.
 */
export async function lookupPurchasableItem(
  purchaseType: PurchaseType,
  itemId: string
): Promise<PurchasableItem | null> {
  const admin = createAdminClient()

  if (purchaseType === 'minute_pack') {
    const { data } = await admin
      .from('minute_packs')
      .select('*')
      .eq('id', itemId)
      .eq('active', true)
      .maybeSingle()
    const pack = data as MinutePack | null
    if (!pack) return null
    return {
      id: pack.id,
      name: pack.name,
      unit_price_eur: Number(pack.price_eur),
      minutes_per_unit: pack.minutes,
      compatible_with: [],
    }
  }

  if (purchaseType === 'addon') {
    const { data } = await admin.from('addons').select('*').eq('id', itemId).maybeSingle()
    const addon = data as Addon | null
    if (!addon) return null
    return {
      id: addon.id,
      name: addon.name,
      unit_price_eur: Number(addon.price_monthly_eur),
      minutes_per_unit: 0,
      compatible_with: addon.compatible_with ?? [],
    }
  }

  // A plan change is priced at the monthly price of the plan being moved to.
  // Proration is Stripe's job and is deliberately not invented here.
  const { data } = await admin.from('plans').select('*').eq('id', itemId).maybeSingle()
  const plan = data as Plan | null
  if (!plan) return null
  if (plan.price_monthly_eur == null) return null
  return {
    id: plan.id,
    name: plan.name,
    unit_price_eur: Number(plan.price_monthly_eur),
    minutes_per_unit: 0,
    compatible_with: [],
  }
}


// What the panel shows -------------------------------------------------------

/**
 * The pack on offer, or null when none is for sale.
 *
 * Null hides the whole buying path rather than showing a button that leads to a
 * dead end, which is also what happens before migration 0014 has run.
 */
export async function getMinutePackOffer(packId = 'pack_250'): Promise<MinutePackOffer | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('minute_packs')
    .select('*')
    .eq('id', packId)
    .eq('active', true)
    .maybeSingle()

  const pack = data as MinutePack | null
  if (!pack) return null
  return {
    id: pack.id,
    name: pack.name,
    minutes: pack.minutes,
    price_eur: Number(pack.price_eur),
    unit_price_eur: Number(pack.unit_price_eur),
  }
}

/**
 * Every add-on in the catalogue, each already told apart: on, included in the
 * plan, for sale, not yet, or not on this plan. The decision is made here,
 * where the plan and the catalogue both are, so the component only draws it.
 */
export async function listAddonOffers(context: ClinicWithPlan): Promise<AddonOffer[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('addons')
    .select('*')
    .order('price_monthly_eur', { ascending: false })

  const rows = (data ?? []) as Addon[]
  return rows.map((addon) => ({
    id: addon.id,
    name: addon.name,
    description: addon.description,
    price_monthly_eur: Number(addon.price_monthly_eur),
    state: addonStateFor(
      {
        id: addon.id,
        feature_unlock: addon.feature_unlock,
        compatible_with: addon.compatible_with ?? [],
      },
      context.plan.id,
      context.plan.features ?? {},
      context.addons
    ),
  }))
}
