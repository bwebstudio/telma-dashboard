import { formatEuro, formatDate } from '@/lib/format'
import type { MinuteBalance } from '@/lib/clinic-utils'
import type { Clinic, Plan } from '@/lib/types'
import type { Dictionary, Locale } from '@/content'

/**
 * What the clinic is on, and when it renews.
 *
 * No upgrade button that charges anything. A plan change moves the price, the
 * number on the invoice and often the number of sedes, and it is a conversation
 * before it is a click. What this offers is the way to start that conversation.
 */
export function PlanSection({
  clinic,
  plan,
  minutes,
  dict,
  locale,
}: {
  clinic: Clinic
  plan: Plan
  minutes: MinuteBalance
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.billing
  const annual = clinic.billing_cycle === 'annual'
  const price = annual ? plan.price_annual_eur : plan.price_monthly_eur

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-xl font-semibold text-ink">{t.planTitle}</h2>

      <dl className="flex flex-col gap-3 text-base">
        <Row label={t.planName} value={dict.plans[plan.id]} />
        <Row
          label={t.price}
          // Null is 'personalizado', which has no list price: it was quoted.
          value={price == null ? t.priceOnRequest : formatEuro(price, locale)}
          hint={price == null ? undefined : annual ? t.perYear : t.perMonth}
        />
        <Row label={t.includedMinutes} value={`${minutes.included}`} />
        <Row
          label={t.renewsAt}
          value={clinic.plan_renews_at ? formatDate(clinic.plan_renews_at, locale) : '·'}
        />
        <Row label={t.locations} value={`${plan.max_locations}`} />
      </dl>

      <p className="mt-5 text-sm text-ink-mute">{t.changePlanHelp}</p>
    </section>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right font-medium text-ink">
        {value}
        {hint && <span className="ml-1 font-normal text-ink-mute">{hint}</span>}
      </dd>
    </div>
  )
}
