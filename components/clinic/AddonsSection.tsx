'use client'

import { useActionState } from 'react'
import { activateAddon } from '@/lib/actions/billing'
import { formatEuro } from '@/lib/format'
import { Badge } from '@/components/ui'
import type { AddonOffer } from '@/lib/purchase-utils'
import type { Dictionary, Locale } from '@/content'

/**
 * What the clinic can switch on, and what it already has.
 *
 * The state of each add-on is decided on the server, where the plan and the
 * catalogue are: 'included' is not the same as 'active', and 'unavailable on
 * this plan' is not the same as 'coming soon'. Four different sentences, and
 * the reader should never have to work out which one applies.
 */
export function AddonsSection({
  addons,
  canBuy,
  dict,
  locale,
}: {
  addons: AddonOffer[]
  canBuy: boolean
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.billing
  const [state, action, pending] = useActionState(activateAddon, null)

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-xl font-semibold text-ink">{t.addonsTitle}</h2>

      {state?.error && (
        <p role="alert" className="mb-4 rounded-input bg-danger-soft px-4 py-3 text-base text-danger">
          {t.errors[state.error]}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {addons.map((addon) => {
          const on = addon.state === 'active' || addon.state === 'included'
          return (
            <li
              key={addon.id}
              className={`flex flex-col gap-3 rounded-card border p-4 ${
                on ? 'border-brand-accent/40 bg-brand-wash' : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{addon.name}</p>
                  {addon.description && (
                    <p className="mt-0.5 text-sm text-ink-soft">{addon.description}</p>
                  )}
                </div>
                {addon.state === 'active' && <Badge tone="ok">{t.addonActive}</Badge>}
                {addon.state === 'included' && <Badge tone="neutral">{t.addonIncluded}</Badge>}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-medium text-ink tabular-nums">
                  {addon.price_monthly_eur > 0 ? (
                    <>
                      {formatEuro(addon.price_monthly_eur, locale)}
                      <span className="font-normal text-ink-mute">{t.perMonth}</span>
                    </>
                  ) : (
                    <span className="font-normal text-ink-mute">{t.addonFree}</span>
                  )}
                </span>

                {addon.state === 'buyable' && canBuy && (
                  <form action={action}>
                    <input type="hidden" name="addon_id" value={addon.id} />
                    <button type="submit" className="btn-secondary px-4" disabled={pending}>
                      {pending ? t.working : t.addonActivate}
                    </button>
                  </form>
                )}
                {addon.state === 'soon' && <span className="text-sm text-ink-mute">{t.addonSoon}</span>}
                {addon.state === 'unavailable' && (
                  <span className="text-sm text-ink-mute">{t.addonNotOnPlan}</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {!canBuy && <p className="mt-4 text-sm text-ink-mute">{t.readOnly}</p>}
    </section>
  )
}
