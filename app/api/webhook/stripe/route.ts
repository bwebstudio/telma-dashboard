import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_PRICE } from '@/lib/plans'
import type { PlanType } from '@/lib/types'
import { verifyWebhookSignature } from '@/lib/onboarding/stripe-client'

/**
 * What Stripe tells us after the clinic has left our site.
 *
 * The sign-up creates the clinic as 'pausada' and sends the browser to
 * Checkout. Everything after that happens here: the browser coming back to the
 * success URL proves nothing, because anyone can open a URL. This endpoint is
 * the only thing allowed to say a clinic has paid.
 *
 * It sits under /api/webhook, which the middleware already excludes from the
 * session gate. That exclusion is why the signature check below is not
 * optional: without it this is an unauthenticated write to the billing state of
 * every clinic.
 */

export const dynamic = 'force-dynamic'

interface StripeEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export async function POST(request: Request) {
  // Read the body as text, once. Re-serialising parsed JSON produces different
  // bytes from what Stripe signed, and the signature would never match again.
  const raw = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!(await verifyWebhookSignature(raw, signature))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  let event: StripeEvent
  try {
    event = JSON.parse(raw) as StripeEvent
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const object = event.data?.object ?? {}
  const metadata = (object.metadata ?? {}) as Record<string, string>
  const clinicId =
    metadata.clinic_id ||
    ((object.subscription_details as { metadata?: Record<string, string> } | undefined)?.metadata
      ?.clinic_id ??
      '')

  // An event about something that is not one of our clinics. Answering 200 is
  // deliberate: a 4xx makes Stripe retry an event that will never apply, and
  // the retries eventually disable the endpoint for the events that do.
  if (!clinicId) return NextResponse.json({ received: true, ignored: event.type })

  const admin = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const plan = (metadata.plan || 'essencial') as PlanType
        const cycle = metadata.billing_cycle === 'annual' ? 'annual' : 'monthly'

        await admin
          .from('clinics')
          .update({
            status: 'ativa',
            stripe_customer_id: (object.customer as string) ?? null,
            stripe_subscription_id: (object.subscription as string) ?? null,
            billing_cycle: cycle,
            plan_renews_at: renewalDate(cycle),
          })
          .eq('id', clinicId)

        // The receipt, in our own table. Stripe has the authoritative copy; this
        // is the one the clinic's own billing screen reads, and it must exist
        // whether or not anyone can reach Stripe's dashboard.
        const amount =
          typeof object.amount_total === 'number'
            ? object.amount_total / 100
            : (PLAN_PRICE[plan] ?? 0)

        await admin.from('purchases').insert({
          clinic_id: clinicId,
          purchase_type: 'plan_upgrade',
          item_id: plan,
          item_name: `Plano ${plan}`,
          quantity: 1,
          unit_price_eur: amount,
          total_price_eur: amount,
          final_price_eur: amount,
          payment_method: 'stripe',
          payment_status: 'completed',
          stripe_invoice_id: (object.invoice as string) ?? null,
        })

        await admin.from('activity_log').insert({
          clinic_id: clinicId,
          type: 'payment_received',
          message: `Primeiro pagamento confirmado. A clínica está ativa.`,
        })
        break
      }

      case 'invoice.payment_failed': {
        // Not cancelled, and not silently left running either. 'pausada' is the
        // state the panel already draws for a clinic that exists and is not
        // answering, and somebody has to call them.
        await admin.from('clinics').update({ status: 'pausada' }).eq('id', clinicId)
        await admin.from('activity_log').insert({
          clinic_id: clinicId,
          type: 'needs_attention',
          message: 'Pagamento recusado. A clínica ficou pausada.',
        })
        break
      }

      case 'customer.subscription.deleted': {
        await admin.from('clinics').update({ status: 'cancelada' }).eq('id', clinicId)
        await admin.from('activity_log').insert({
          clinic_id: clinicId,
          type: 'subscription_cancelled',
          message: 'Subscrição cancelada na Stripe.',
        })
        break
      }

      default:
        return NextResponse.json({ received: true, ignored: event.type })
    }
  } catch (e) {
    // A 500 asks Stripe to retry, which is what we want: the event was real and
    // our side failed to apply it.
    console.error('[stripe] webhook handling failed', event.type, e)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/** The day the allowance resets and the next charge lands. */
function renewalDate(cycle: 'monthly' | 'annual'): string {
  const d = new Date()
  if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}
