'use client'

import { useEffect, useState } from 'react'
import { checkoutQuote, type CheckoutQuote } from '@/lib/actions/checkout-quote'
import { copyFor } from '@/lib/onboarding/copy'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * The screen between the last question and the charge.
 *
 * The sign-up used to end on a button that said "inscrever" and went straight
 * to Stripe. Somebody about to pay 249 a month had no way, before leaving our
 * site, to check that 249 was the number, that the add-on they ticked four
 * steps earlier was in there, or what the tax would be. Pressing it was an
 * act of faith, and the people least willing to perform one are the careful
 * ones, who are also the ones who stay.
 *
 * ── THE NUMBERS COME FROM THE THING THAT CHARGES ──────────────────────────
 * Not from the plans table, which is what the site advertises, and not from
 * this file. Both would be a promise the checkout is free to break, and it
 * would break it at the exact moment a clinic is deciding whether we are
 * careful people. See lib/actions/checkout-quote.
 *
 * ── AND IT NEVER BLOCKS THE SALE ──────────────────────────────────────────
 * When Stripe cannot be reached, or the tax rate cannot be read, this says
 * what it does not know and lets them continue: the exact figures are on
 * Stripe's own page before anybody confirms. A sign-up that cannot proceed
 * because a summary failed to load is worse than a summary that admits it.
 */
export function SummaryStep({
  values,
  locale,
  planName,
}: {
  values: Record<string, unknown>
  locale: OnboardingLocale
  /** The plan's own name, as step 1 showed it. */
  planName: string
}) {
  const t = copyFor(locale)
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [failed, setFailed] = useState(false)

  const plan = String(values.plan_id ?? '')
  const cycle = values.billing_cycle === 'annual' ? 'annual' : 'monthly'
  const whatsapp = values.addon_whatsapp === true
  const region = String(values.region ?? '')

  useEffect(() => {
    let live = true
    setQuote(null)
    setFailed(false)
    checkoutQuote({ plan, cycle, whatsapp, region })
      .then((q) => live && setQuote(q))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [plan, cycle, whatsapp, region])

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'pt-PT', {
      style: 'currency',
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100)

  const cycleWord = cycle === 'annual' ? t.summaryCycleAnnual : t.summaryCycleMonthly
  const per = cycle === 'annual' ? t.summaryPerYear : t.summaryPerMonth

  if (failed) {
    return <Note>{t.summaryFailed}</Note>
  }

  if (!quote) {
    return <Note>{t.summaryLoading}</Note>
  }

  if (quote.byArrangement) {
    return <Note>{t.summaryByArrangement}</Note>
  }

  if (!quote.ok) {
    return <Note>{t.summaryFailed}</Note>
  }

  const label = (kind: QuoteKind) =>
    kind === 'whatsapp' ? t.summaryWhatsapp : t.summaryPlanLine(planName, cycleWord)

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-base text-ink-soft">{t.summaryLead}</p>

      <table className="w-full text-base">
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.lookupKey} className="border-b border-line">
              <td className="py-3 pr-4 text-ink">{label(l.kind)}</td>
              <td className="py-3 text-right tabular-nums text-ink">
                {money(l.amount, quote.currency)}
              </td>
            </tr>
          ))}

          {/* Subtotal only when there is tax to add under it. One line of
              arithmetic over a single item is noise. */}
          {quote.taxPercentage !== null && quote.taxPercentage > 0 && (
            <tr className="border-b border-line">
              <td className="py-3 pr-4 text-ink-soft">{t.summarySubtotal}</td>
              <td className="py-3 text-right tabular-nums text-ink-soft">
                {money(quote.subtotal, quote.currency)}
              </td>
            </tr>
          )}

          <tr className="border-b border-line">
            <td className="py-3 pr-4 text-ink-soft">
              {quote.taxPercentage === null
                ? (quote.taxLabel ?? 'IVA')
                : `${quote.taxLabel ?? 'IVA'} ${quote.taxPercentage}%`}
            </td>
            <td className="py-3 text-right tabular-nums text-ink-soft">
              {quote.taxPercentage === null
                ? t.summaryTaxUnknown
                : money(quote.taxAmount, quote.currency)}
            </td>
          </tr>

          <tr>
            <td className="py-4 pr-4 text-lg font-semibold text-ink">{t.summaryTotalNow}</td>
            <td className="py-4 text-right text-lg font-semibold tabular-nums text-ink">
              {money(quote.total, quote.currency)}
              <span className="ml-1 text-sm font-normal text-ink-mute">{per}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {quote.reverseCharge && (
        <p className="max-w-prose rounded-card bg-surface-sunken px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {t.summaryReverseCharge}
        </p>
      )}

      <div className="flex flex-col gap-1 text-sm text-ink-mute">
        <p>{t.summaryRenews(cycle)}</p>
        <p>{t.summaryCancel}</p>
      </div>
    </div>
  )
}

type QuoteKind = CheckoutQuote['lines'][number]['kind']

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose rounded-card bg-surface-sunken px-5 py-4 text-base text-ink-soft">
      {children}
    </p>
  )
}
