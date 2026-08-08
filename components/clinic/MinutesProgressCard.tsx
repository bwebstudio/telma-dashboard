import { BuyMinutesButton } from './BuyMinutesButton'
import { percentUsed, usageTone, type MinutePackOffer } from '@/lib/purchase-utils'
import { formatEuro } from '@/lib/format'
import type { MinuteBalance } from '@/lib/clinic-utils'
import type { Dictionary, Locale } from '@/content'

const BAR: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}
const TEXT: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}

/**
 * How many minutes are left, and what to do about it.
 *
 * The card earns its place at the top of the day only when it has something to
 * say. Under 80% it is one quiet line; past that it warns; at zero it says
 * plainly that Telma has stopped booking, because that is a fact about the
 * clinic's phone and nobody should discover it from a patient.
 *
 * A server component: the figures come from the database, and the only thing
 * that has to react to a click is the button.
 */
export function MinutesProgressCard({
  minutes,
  pack,
  canBuy,
  dict,
  locale,
}: {
  minutes: MinuteBalance
  /** Null when no pack is on sale, which hides the whole buying path. */
  pack: MinutePackOffer | null
  /** False while an administrator is visiting: a visit spends nothing. */
  canBuy: boolean
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.billing
  const percent = percentUsed(minutes.used, minutes.allowance)
  const tone = usageTone(percent, minutes.exhausted)
  const used = Math.round(minutes.used)
  const remaining = Math.round(minutes.remaining)

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold text-ink">{t.minutesTitle}</h2>
        <p className="text-sm text-ink-mute tabular-nums">
          {percent}% {t.percentUsed}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-semibold tabular-nums text-ink">{used}</span>
        <span className="text-lg text-ink-mute tabular-nums">
          {dict.common.of} {minutes.allowance}
        </span>
        <span className="text-lg text-ink-mute">{t.minutesWord}</span>
        <span className={`ml-auto text-lg font-medium tabular-nums ${TEXT[tone]}`}>
          {remaining} {t.remaining}
        </span>
      </div>

      {/* The bar carries a number for anyone who cannot see the colour, and the
          colour for everyone reading it at a glance across the room. */}
      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-wash"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t.minutesTitle}
      >
        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${percent}%` }} />
      </div>

      {minutes.purchased > 0 && (
        <p className="mt-2 text-sm text-ink-mute">
          {t.includesPurchased} {minutes.purchased} {t.minutesWord}
        </p>
      )}

      {/* One notice at a time, and only when there is one to give. */}
      {minutes.exhausted ? (
        <p
          role="alert"
          className="mt-4 rounded-input bg-danger-soft px-4 py-3 text-base text-danger"
        >
          {t.exhausted}
        </p>
      ) : percent >= 80 ? (
        <p className="mt-4 rounded-input bg-warn-soft px-4 py-3 text-base text-warn">
          {t.nearLimit}
        </p>
      ) : null}

      {pack && canBuy && (
        <div className="mt-5">
          <BuyMinutesButton
            pack={pack}
            dict={dict}
            locale={locale}
            emphasis={minutes.exhausted || percent >= 80}
          />
          <p className="mt-2 text-sm text-ink-mute">
            {pack.minutes} {t.minutesWord} · {formatEuro(pack.price_eur, locale)} ·{' '}
            {t.insteadOf} {formatEuro(minutes.extra_minute_price_eur, locale)}/{t.minuteWord}
          </p>
        </div>
      )}

      {pack && !canBuy && <p className="mt-5 text-sm text-ink-mute">{t.readOnly}</p>}
    </section>
  )
}
