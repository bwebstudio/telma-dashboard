import { Badge } from '@/components/ui'
import { formatDate, formatEuro } from '@/lib/format'
import type { PaymentStatus, Purchase } from '@/lib/types'
import type { Dictionary, Locale } from '@/content'

const STATUS_TONE: Record<PaymentStatus, 'ok' | 'pending' | 'danger' | 'neutral'> = {
  completed: 'ok',
  pending: 'pending',
  failed: 'danger',
  refunded: 'neutral',
}

/**
 * Every euro this clinic has been charged, newest first.
 *
 * It exists to be checked against a bank statement, so it shows what was paid
 * and what was taken off, not a marketing summary. A discount is a line of its
 * own under the price: "79 €" and "79 € minus 8" are different facts and a
 * clinic reconciling an invoice needs both.
 */
export function PurchaseHistoryTable({
  purchases,
  dict,
  locale,
}: {
  purchases: Purchase[]
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.billing

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-xl font-semibold text-ink">{t.historyTitle}</h2>

      {purchases.length === 0 ? (
        <p className="py-8 text-center text-lg text-ink-mute">{t.historyEmpty}</p>
      ) : (
        // A narrow phone scrolls the table rather than wrapping a price onto
        // two lines: a column of figures that no longer lines up is harder to
        // check than one that has to be nudged sideways.
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[34rem] border-collapse text-base">
            <thead>
              <tr className="border-b border-line text-left">
                <Th>{dict.common.date}</Th>
                <Th>{t.colItem}</Th>
                <Th align="right">{t.colQuantity}</Th>
                <Th align="right">{t.colPrice}</Th>
                <Th>{dict.common.status}</Th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3 text-ink-soft tabular-nums">
                    {formatDate(purchase.purchased_at, locale)}
                  </td>
                  <td className="py-3 pr-3 text-ink">{purchase.item_name}</td>
                  <td className="py-3 pr-3 text-right text-ink-soft tabular-nums">
                    {purchase.quantity}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    <span className="font-medium text-ink">
                      {formatEuro(Number(purchase.final_price_eur), locale)}
                    </span>
                    {Number(purchase.discount_eur) > 0 && (
                      <span className="block text-sm text-ok">
                        −{formatEuro(Number(purchase.discount_eur), locale)}
                        {purchase.coupon_code ? ` · ${purchase.coupon_code}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <Badge tone={STATUS_TONE[purchase.payment_status] ?? 'neutral'}>
                      {t.status[purchase.payment_status] ?? purchase.payment_status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`label-caps pb-2 pr-3 font-medium ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </th>
  )
}
