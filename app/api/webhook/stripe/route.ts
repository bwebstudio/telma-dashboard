import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * Os metadados da subscrição, onde quer que a Stripe os ponha hoje.
 *
 * ── ONDE ELES PASSARAM A ESTAR ────────────────────────────────────────────
 * Encontrado em 23/11, a perguntar porque é que a primeira clínica a pagar
 * não tinha recibo nenhum no painel um mês depois de pagar. A fatura existe e
 * está certa, 103,50 EUR em 27/10, e o evento chegou aqui: o que não chegou
 * foi o `clinic_id`. Nas versões novas da API a fatura já não traz
 * `subscription_details` na raiz, traz `parent.subscription_details`, e é lá
 * que ele vai. Sem clínica, este webhook responde "ignored" e não escreve
 * nada: nem a compra, nem a data de renovação, nem o registo de atividade.
 *
 * A metade pior não é o recibo em falta. `invoice.payment_failed` perde-se
 * pelo mesmo caminho, e uma clínica cujo cartão falhasse nunca seria pausada:
 * continuava a atender o telefone sem ninguém saber que tinha deixado de
 * pagar.
 *
 * Lê-se nas duas formas. A antiga ainda chega de contas cuja versão da API
 * está presa a uma anterior, e nenhuma das duas custa nada a tentar.
 */
function subscriptionMetadata(object: Record<string, unknown>): Record<string, string> {
  const fromParent = (
    object.parent as { subscription_details?: { metadata?: Record<string, string> } } | undefined
  )?.subscription_details?.metadata
  const fromRoot = (object.subscription_details as { metadata?: Record<string, string> } | undefined)
    ?.metadata
  return fromParent ?? fromRoot ?? {}
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
  const subscriptionMeta = subscriptionMetadata(object)
  const clinicId = metadata.clinic_id || subscriptionMeta.clinic_id || ''

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

        // The billing facts, always.
        await admin
          .from('clinics')
          .update({
            stripe_customer_id: (object.customer as string) ?? null,
            stripe_subscription_id: (object.subscription as string) ?? null,
            billing_cycle: cycle,
            // A guess until the invoice says otherwise. With a week of
            // implementation in front of it this is a week short, and the
            // invoice event below corrects it with Stripe's own period end.
            plan_renews_at: renewalDate(cycle),
          })
          .eq('id', clinicId)

        // ── PAID IS NOT THE SAME AS ANSWERING ────────────────────────────
        // This used to write 'ativa' here, and that quietly made the whole
        // setup screen unreachable. A clinic is created 'pausada' when Stripe
        // is configured, so the only path a paying clinic ever took was
        // pausada -> ativa: it never passed through 'por_configurar', never
        // met the guided setup, and landed on an agenda with a forwarding
        // card telling it to point its telephone at a Telma who had not been
        // told the opening hours or what the clinic does.
        //
        // Payment means the account is paid. Whether Telma answers is the
        // clinic's own decision, taken in `activateClinic` once it has told
        // her something, and that action checks the same list again.
        //
        // Scoped to 'pausada' so a second checkout -- a plan change, a card
        // replaced -- cannot take a working clinic off the telephone.
        await admin
          .from('clinics')
          .update({ status: 'por_configurar' })
          .eq('id', clinicId)
          .eq('status', 'pausada')

        // ── THE RECEIPT MOVED ────────────────────────────────────────
        // It used to be written here, because finishing the checkout and
        // being charged were the same moment. They are not any more: a
        // clinic on an implementation week finishes now and pays in seven
        // days, and the session's total today is zero. A purchase row
        // written here would say 0 EUR and the real charge would never
        // appear at all, because nothing was listening for it.
        //
        // So the receipt is written where the money is: in
        // `invoice.payment_succeeded`, which also means a renewal finally
        // shows up in the clinic's own billing history. It never did.
        break
      }

      case 'invoice.payment_succeeded': {
        // Money, actually. Not the end of a checkout, which is a different
        // moment and since the implementation week not even the same day.
        //
        // Idempotent by the invoice: 0062 made (clinic, invoice, item)
        // unique and the upsert asks for the row back, so a redelivered
        // event writes nothing and logs nothing. Webhooks arrive at least
        // once and this is the table with the money in it.
        // The invoice's own metadata is empty; what it carries is the
        // subscription's, under `subscription_details`. Read in that order,
        // and the fallback stays because a clinic signed up before today has
        // a subscription with no plan on it and its renewal still has to
        // produce a receipt. See the note in lib/onboarding/stripe-client.
        const plan = (metadata.plan || subscriptionMeta.plan || 'essencial') as PlanType
        const paid = typeof object.amount_paid === 'number' ? object.amount_paid / 100 : 0

        // Nothing was charged: the first invoice of a subscription that
        // starts with an implementation week is zero and is not a receipt.
        if (paid <= 0) {
          return NextResponse.json({ received: true, ignored: 'zero_invoice' })
        }

        const { data: written } = await admin
          .from('purchases')
          .upsert(
            {
              clinic_id: clinicId,
              purchase_type: 'plan_upgrade',
              item_id: plan,
              item_name: `Plano ${plan}`,
              quantity: 1,
              unit_price_eur: paid,
              total_price_eur: paid,
              final_price_eur: paid,
              payment_method: 'stripe',
              payment_status: 'completed',
              stripe_invoice_id: (object.id as string) ?? null,
            },
            { onConflict: 'clinic_id,stripe_invoice_id,item_id', ignoreDuplicates: true }
          )
          .select('id')

        // ── A DATA QUE A CLÍNICA LÊ É A DA LINHA, NÃO A DA FATURA ──────
        // A fatura tem um período seu e a linha tem o dela, e na primeira
        // fatura a seguir a uma semana de implementação são coisas
        // diferentes: a fatura de 27/10 da primeira clínica diz 20/10 a
        // 27/10, que é a semana, e a linha diz 27/10 a 27/11, que é o mês
        // pago. "Renova a" é o fim do mês pago, por isso é a linha que manda.
        // Nas renovações normais as duas coincidem e isto continua certo.
        const lineEnd = ((object.lines as { data?: Array<{ period?: { end?: number } }> } | undefined)
          ?.data ?? [])
          .map((l) => l.period?.end)
          .filter((t): t is number => typeof t === 'number')
          .pop()
        const end = lineEnd ?? (object as { period_end?: unknown }).period_end
        const periodEnd =
          typeof end === 'number' ? new Date(end * 1000).toISOString().slice(0, 10) : null
        if (periodEnd) {
          await admin.from('clinics').update({ plan_renews_at: periodEnd }).eq('id', clinicId)
        }

        // A clinic whose first charge lands after a week of implementation
        // has been waiting in 'pausada' since it signed up. Same guard as
        // the checkout: only from 'pausada', so a renewal cannot take a
        // working clinic off the telephone.
        await admin
          .from('clinics')
          .update({ status: 'por_configurar' })
          .eq('id', clinicId)
          .eq('status', 'pausada')

        if (written?.length) {
          await admin.from('activity_log').insert({
            clinic_id: clinicId,
            type: 'payment_received',
            message: `Pagamento de ${paid.toFixed(2)} € confirmado.`,
          })
        }
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
