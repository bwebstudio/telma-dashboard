'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { getClinicWithPlan, lookupPurchasableItem } from '@/lib/clinic-utils'
import { COMING_SOON, quotePurchase } from '@/lib/purchase-utils'
import type { Purchase } from '@/lib/types'

/**
 * Buying, from inside the panel.
 *
 * These do the same work as POST /api/purchases and deliberately do not go
 * through it. That endpoint answers to the voice agent's bearer token, and the
 * only way the browser could carry that token is by shipping it in the bundle,
 * where anyone could read it and buy minutes for any clinic they liked. The
 * panel already knows who is signed in, so the clinic id comes from the
 * session and is never accepted from the form.
 *
 * The prices are read here too, from the catalogue, not from the form. What
 * the modal shows is a preview; what is charged is what this computes.
 */

// Same rule as the rest of the clinic's own screens: only the clinic buys, and
// the administrator visiting a panel is read only. Spending a client's money on
// their behalf is not a thing a support visit should be able to do.
async function ownClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

export interface BillingResult {
  ok?: true
  /** A key the caller turns into a sentence in the reader's language. */
  error?:
    | 'demo'
    | 'forbidden'
    | 'item'
    | 'plan_incompatible'
    | 'already_active'
    | 'coming_soon'
    | 'generic'
  purchase?: Purchase | null
  minutes_granted?: number
  final_price_eur?: number
}

// A pack is 250 minutes; twenty of them is five thousand, which is more than
// the largest plan sells in a month. Past that it is a typo, not an order.
const MAX_PACKS = 20

export async function buyMinutePack(
  _prev: BillingResult | null,
  formData: FormData
): Promise<BillingResult> {
  let clinicId: string
  try {
    clinicId = await ownClinicId()
  } catch {
    return { error: 'forbidden' }
  }
  // Demo mode has no database to write a receipt to, and pretending the
  // purchase went through would leave the demo showing minutes nobody bought.
  if (isDemo()) return { error: 'demo' }

  const packId = String(formData.get('pack_id') || 'pack_250')
  const quantity = Math.min(MAX_PACKS, Math.max(1, Math.floor(Number(formData.get('quantity'))) || 1))
  const couponCode = String(formData.get('coupon_code') || '')

  const item = await lookupPurchasableItem('minute_pack', packId)
  if (!item) return { error: 'item' }

  const quote = quotePurchase(item.unit_price_eur, quantity, couponCode)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('apply_purchase', {
    p_clinic_id: clinicId,
    p_purchase_type: 'minute_pack',
    p_item_id: item.id,
    p_item_name: item.name,
    p_quantity: quote.quantity,
    p_unit_price_eur: item.unit_price_eur,
    p_total_price_eur: quote.total_price_eur,
    p_coupon_code: quote.coupon,
    p_discount_eur: quote.discount_eur,
    p_discount_percent: quote.discount_percent,
    p_final_price_eur: quote.final_price_eur,
    p_payment_method: 'manual',
    p_payment_status: 'completed',
    p_minutes_per_unit: item.minutes_per_unit,
  })
  if (error) return { error: 'generic' }

  refresh()
  return {
    ok: true,
    purchase: data as Purchase | null,
    minutes_granted: item.minutes_per_unit * quote.quantity,
    final_price_eur: quote.final_price_eur,
  }
}

export async function activateAddon(
  _prev: BillingResult | null,
  formData: FormData
): Promise<BillingResult> {
  let clinicId: string
  try {
    clinicId = await ownClinicId()
  } catch {
    return { error: 'forbidden' }
  }
  if (isDemo()) return { error: 'demo' }

  const addonId = String(formData.get('addon_id') || '')
  if (!addonId) return { error: 'item' }
  if (COMING_SOON.includes(addonId)) return { error: 'coming_soon' }

  const context = await getClinicWithPlan(clinicId)
  if (!context) return { error: 'generic' }

  const item = await lookupPurchasableItem('addon', addonId)
  if (!item) return { error: 'item' }

  // The same two refusals the API makes, for the same reasons: an add-on is
  // sold only where it is offered, and buying one twice bills twice for one
  // thing.
  if (item.compatible_with.length > 0 && !item.compatible_with.includes(context.clinic.plan)) {
    return { error: 'plan_incompatible' }
  }
  if (context.addons.includes(addonId)) return { error: 'already_active' }

  const quote = quotePurchase(item.unit_price_eur, 1, null)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('apply_purchase', {
    p_clinic_id: clinicId,
    p_purchase_type: 'addon',
    p_item_id: item.id,
    p_item_name: item.name,
    p_quantity: 1,
    p_unit_price_eur: item.unit_price_eur,
    p_total_price_eur: quote.total_price_eur,
    p_coupon_code: null,
    p_discount_eur: 0,
    p_discount_percent: 0,
    p_final_price_eur: quote.final_price_eur,
    p_payment_method: 'manual',
    p_payment_status: 'completed',
    p_minutes_per_unit: 0,
  })
  if (error) return { error: 'generic' }

  refresh()
  return { ok: true, purchase: data as Purchase | null, final_price_eur: quote.final_price_eur }
}

// An add-on changes what the whole panel offers, not only the screen it was
// bought from: WhatsApp appears in the agenda's tallies and in the
// conversations filter the moment it is on.
function refresh() {
  revalidatePath('/', 'layout')
}
