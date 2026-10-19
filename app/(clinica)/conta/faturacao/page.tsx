import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { BillingLive } from '@/components/clinic/BillingLive'
import { MinutesProgressCard } from '@/components/clinic/MinutesProgressCard'
import { BillingPortalButton } from '@/components/clinic/BillingPortalButton'
import { PlanSection } from '@/components/clinic/PlanSection'
import { AddonsSection } from '@/components/clinic/AddonsSection'
import { PurchaseHistoryTable } from '@/components/clinic/PurchaseHistoryTable'
import { SubscriptionSection } from '@/components/clinic/SubscriptionSection'
import { getClinicWithPlan, getMinutePackOffer, listAddonOffers } from '@/lib/clinic-utils'
import type { Purchase } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * What the clinic pays, what it has paid, and how to stop paying it.
 *
 * ── WHY THE ROWS PAIR OR SPAN, AND NEVER HALF ─────────────────────────────
 * The plan and the minutes are guarded by the same condition, so they arrive
 * together or not at all: one row of two, never a card with a hole beside it.
 * Everything else spans the width. A two column grid whose cards appear on
 * different conditions produces empty halves, which read as something that
 * failed to load.
 */
export default async function FaturacaoPage() {
  const { locale, dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const [billing, pack, purchasesRes] = await Promise.all([
    getClinicWithPlan(clinicId),
    getMinutePackOffer(),
    // Through the session client, not the service role: this is the clinic
    // reading its own receipts, and the policy that says so should be the
    // thing enforcing it.
    supabase
      .from('purchases')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('purchased_at', { ascending: false })
      .limit(50),
  ])

  const addons = billing ? await listAddonOffers(billing) : []
  const purchases = (purchasesRes.data ?? []) as Purchase[]

  return (
    <>
      <BillingLive clinicId={clinicId} />
      <PageHeader eyebrow={dict.conta.accountMenu} title={dict.conta.billingTitle} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {billing && (
          <>
            <PlanSection
              clinic={billing.clinic}
              plan={billing.plan}
              minutes={billing.minutes}
              dict={dict}
              locale={locale}
            />
            {/* The same card as the agenda's, on purpose. Two drawings of one
                number is how a panel ends up telling a clinic two different
                things about how many minutes it has left. */}
            <MinutesProgressCard
              minutes={billing.minutes}
              pack={pack}
              canBuy={!readOnly}
              dict={dict}
              locale={locale}
            />
          </>
        )}

        {addons.length > 0 && (
          <div className="lg:col-span-2">
            <AddonsSection addons={addons} canBuy={!readOnly} dict={dict} locale={locale} />
          </div>
        )}

        {/* Invoices, card and cancellation: one door, hosted by Stripe and
            wearing our name. Building the invoice screen ourselves would be a
            second version of a legal document, and the first time it
            disagreed with theirs it would be in front of an accountant. */}
        <section className="card p-6 lg:col-span-2">
          <SectionTitle>{dict.billingPortal.title}</SectionTitle>
          <p className="mb-4 max-w-prose text-base text-ink-soft">{dict.billingPortal.help}</p>
          <BillingPortalButton
            label={dict.billingPortal.open}
            opening={dict.billingPortal.opening}
            failed={dict.billingPortal.failed}
            readOnly={readOnly}
          />
        </section>

        <div className="lg:col-span-2">
          <PurchaseHistoryTable purchases={purchases} dict={dict} locale={locale} />
        </div>

        {clinic && (
          <SubscriptionSection
            status={clinic.status}
            pausedUntil={clinic.service_paused_until ?? null}
            renewsAt={clinic.plan_renews_at ?? null}
            cancelEffectiveAt={clinic.cancel_effective_at ?? null}
            deletionRequestedAt={clinic.deletion_requested_at ?? null}
            readOnly={readOnly}
            locale={locale}
            dict={dict}
          />
        )}
      </div>
    </>
  )
}
