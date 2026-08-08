'use client'

import { useActionState, useEffect, useState } from 'react'
import { Modal } from './Modal'
import { buyMinutePack } from '@/lib/actions/billing'
import { quotePurchase, type MinutePackOffer } from '@/lib/purchase-utils'
import { formatEuro } from '@/lib/format'
import type { Dictionary, Locale } from '@/content'

/**
 * Buying a pack of minutes.
 *
 * The total is computed here as the clinic types, and again on the server from
 * the catalogue price when the form is submitted. Only the second one is
 * charged. The one on the button exists so nobody presses it without knowing
 * what it costs.
 */
export function BuyMinutesModal({
  pack,
  onClose,
  onBought,
  dict,
  locale,
}: {
  pack: MinutePackOffer
  onClose: () => void
  onBought: (minutes: number) => void
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.billing
  const [quantity, setQuantity] = useState(1)
  const [coupon, setCoupon] = useState('')
  const [state, action, pending] = useActionState(buyMinutePack, null)

  const quote = quotePurchase(pack.price_eur, quantity, coupon)

  useEffect(() => {
    if (state?.ok) onBought(state.minutes_granted ?? 0)
  }, [state, onBought])

  const error = state?.error ? t.errors[state.error] : null

  return (
    <Modal title={t.buyTitle} onClose={onClose}>
      <form action={action} className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-semibold text-ink">{t.buyTitle}</h2>
          <p className="mt-1 text-base text-ink-soft">
            {pack.minutes} {t.minutesPerPack} · {formatEuro(pack.price_eur, locale)}
          </p>
        </div>

        <input type="hidden" name="pack_id" value={pack.id} />

        {/* Quantity ------------------------------------------------------- */}
        <div>
          <label className="field-label" htmlFor="buy-quantity">
            {t.quantity}
          </label>
          <div className="flex items-center gap-2">
            <Step
              label={t.quantityLess}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={pending || quantity <= 1}
            >
              −
            </Step>
            <input
              id="buy-quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={quantity}
              disabled={pending}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setQuantity(Number.isFinite(next) ? Math.min(20, Math.max(1, next)) : 1)
              }}
              className="field-input w-24 text-center tabular-nums"
            />
            <Step
              label={t.quantityMore}
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              disabled={pending || quantity >= 20}
            >
              +
            </Step>
            <span className="text-base text-ink-soft">
              {quantity * pack.minutes} {t.minutesWord}
            </span>
          </div>
        </div>

        {/* Coupon --------------------------------------------------------- */}
        <div>
          <label className="field-label" htmlFor="buy-coupon">
            {t.coupon}
          </label>
          <input
            id="buy-coupon"
            name="coupon_code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={coupon}
            disabled={pending}
            placeholder={t.couponPlaceholder}
            onChange={(event) => setCoupon(event.target.value.toUpperCase())}
            className="field-input uppercase"
          />
          {quote.coupon_valid && (
            <p className="mt-1.5 text-sm font-medium text-ok">
              {quote.discount_percent}% {t.couponApplied}
            </p>
          )}
          {quote.coupon_rejected && (
            <p className="mt-1.5 text-sm text-ink-mute">{t.couponUnknown}</p>
          )}
        </div>

        {/* What it costs -------------------------------------------------- */}
        <dl className="flex flex-col gap-1.5 rounded-input bg-surface-sunken p-4 text-base">
          <Line
            label={`${quote.quantity} × ${pack.name}`}
            value={formatEuro(quote.total_price_eur, locale)}
          />
          {quote.discount_eur > 0 && (
            <Line
              label={`${t.discount} (${quote.discount_percent}%)`}
              value={`−${formatEuro(quote.discount_eur, locale)}`}
              tone="ok"
            />
          )}
          <div className="mt-1.5 border-t border-line pt-2.5">
            <Line
              label={t.toPay}
              value={formatEuro(quote.final_price_eur, locale)}
              strong
            />
          </div>
        </dl>

        {error && (
          <p role="alert" className="rounded-input bg-danger-soft px-4 py-3 text-base text-danger">
            {error}
          </p>
        )}

        <p className="text-sm text-ink-mute">{t.buyHelp}</p>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            {dict.common.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? t.working : `${t.confirm} ${formatEuro(quote.final_price_eur, locale)}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Step({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-input border border-line-strong bg-surface text-xl text-ink transition-colors duration-fast ease-calm hover:border-ink/25 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'ok'
  strong?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${tone === 'ok' ? 'text-ok' : ''}`}>
      <dt className={strong ? 'font-medium text-ink' : ''}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-lg font-semibold text-ink' : ''}`}>{value}</dd>
    </div>
  )
}
