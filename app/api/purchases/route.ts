import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  applyCoupon,
  getClinicWithPlan,
  lookupPurchasableItem,
  validateCoupon,
} from '@/lib/clinic-utils'
import type { Purchase, PurchaseType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PURCHASE_TYPES: PurchaseType[] = ['addon', 'minute_pack', 'plan_upgrade', 'plan_downgrade']

// POST /api/purchases
// { clinic_id, purchase_type, item_id, quantity?, coupon_code?, payment_method? }
//
// Buy something and get it in the same breath: the receipt is written and the
// entitlement is granted in one database call, so a clinic can never be charged
// for minutes it did not receive.
//
// No Stripe yet. The purchase is recorded as completed with whatever payment
// method the internal team used, and `stripe_invoice_id` comes back null: the
// column is there so that wiring the gateway later means creating the purchase
// as 'pending' and letting the webhook flip it, and nothing else moves.
export async function POST(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clinicId = body.clinic_id as string | undefined
  const purchaseType = body.purchase_type as PurchaseType | undefined
  const itemId = body.item_id as string | undefined
  if (!clinicId || !purchaseType || !itemId) {
    return NextResponse.json(
      { error: 'clinic_id_purchase_type_and_item_id_required' },
      { status: 400 }
    )
  }
  if (!PURCHASE_TYPES.includes(purchaseType)) {
    return NextResponse.json({ error: 'invalid_purchase_type' }, { status: 400 })
  }

  const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)) || 1)

  const context = await getClinicWithPlan(clinicId)
  if (!context) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }

  const item = await lookupPurchasableItem(purchaseType, itemId)
  if (!item) {
    return NextResponse.json({ error: 'item_not_found', item_id: itemId }, { status: 404 })
  }

  // Sold only where it is offered. Analytics is not on this list for Rede
  // because Rede includes it, and charging for it there would be charging
  // twice for the same thing.
  if (item.compatible_with.length > 0 && !item.compatible_with.includes(context.clinic.plan)) {
    return NextResponse.json(
      {
        error: 'plan_incompatible',
        plan: context.clinic.plan,
        compatible_with: item.compatible_with,
      },
      { status: 409 }
    )
  }

  if (purchaseType === 'addon' && context.addons.includes(itemId)) {
    return NextResponse.json({ error: 'addon_already_active', item_id: itemId }, { status: 409 })
  }

  if (
    (purchaseType === 'plan_upgrade' || purchaseType === 'plan_downgrade') &&
    itemId === context.clinic.plan
  ) {
    return NextResponse.json({ error: 'already_on_plan', plan: itemId }, { status: 409 })
  }

  const total = round2(item.unit_price_eur * quantity)
  const coupon = await validateCoupon((body.coupon_code as string | undefined) ?? '')
  const priced = applyCoupon(total, coupon)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('apply_purchase', {
    p_clinic_id: clinicId,
    p_purchase_type: purchaseType,
    p_item_id: item.id,
    p_item_name: item.name,
    p_quantity: quantity,
    p_unit_price_eur: item.unit_price_eur,
    p_total_price_eur: total,
    // An unknown code is recorded as null rather than as itself: the receipt
    // says what was applied, and nothing was.
    p_coupon_code: coupon.valid ? (coupon.code ?? null) : null,
    p_discount_eur: priced.discount_eur,
    p_discount_percent: priced.discount_percent,
    p_final_price_eur: priced.final_price_eur,
    p_payment_method: (body.payment_method as string | undefined) ?? 'manual',
    p_payment_status: 'completed',
    p_minutes_per_unit: item.minutes_per_unit,
  })

  if (error) {
    const known = ['clinic_not_found', 'unknown_plan'].find((k) => error.message.includes(k))
    return NextResponse.json({ error: known ?? error.message }, { status: known ? 400 : 500 })
  }

  const purchase = data as Purchase | null

  return NextResponse.json(
    {
      ok: true,
      purchase,
      // What the clinic is told it bought, separated from the row so the
      // checkout does not have to read a receipt to draw a confirmation.
      summary: {
        item: item.name,
        quantity,
        unit_price_eur: item.unit_price_eur,
        total_price_eur: total,
        coupon: coupon.valid ? coupon.code : null,
        coupon_valid: coupon.valid,
        discount_eur: priced.discount_eur,
        discount_percent: priced.discount_percent,
        final_price_eur: priced.final_price_eur,
        minutes_granted: item.minutes_per_unit * quantity,
      },
      stripe_invoice_id: null,
    },
    { status: 201 }
  )
}

// GET /api/purchases?clinic_id=...&limit=20
// The receipts, newest first. What the internal team reads when a clinic asks
// what it was charged for.
export async function GET(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clinicId = searchParams.get('clinic_id')
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id_required' }, { status: 400 })
  }
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20) || 20))

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('purchases')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('purchased_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clinic_id: clinicId, purchases: (data ?? []) as Purchase[] })
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
