'use client'

import { useCallback, useState } from 'react'
import { BuyMinutesModal } from './BuyMinutesModal'
import type { MinutePackOffer } from '@/lib/purchase-utils'
import type { Dictionary, Locale } from '@/content'

/**
 * The button, and the dialog it opens.
 *
 * Split out from the card so the card itself stays a server component: the
 * numbers on it come from the database and never need to be recomputed in the
 * browser. What ships to the client is this, which is the only part that has
 * anything to respond to.
 */
export function BuyMinutesButton({
  pack,
  dict,
  locale,
  emphasis,
}: {
  pack: MinutePackOffer
  dict: Dictionary
  locale: Locale
  /** Primary once the minutes are running out; quieter before that. */
  emphasis: boolean
}) {
  const t = dict.billing
  const [open, setOpen] = useState(false)
  const [granted, setGranted] = useState<number | null>(null)

  const onBought = useCallback((minutes: number) => {
    setOpen(false)
    setGranted(minutes)
  }, [])

  return (
    <>
      <button
        type="button"
        className={`${emphasis ? 'btn-primary' : 'btn-secondary'} w-full sm:w-auto`}
        onClick={() => {
          setGranted(null)
          setOpen(true)
        }}
      >
        {t.buyCta}
      </button>

      {/* The confirmation stays on the card rather than in a toast that
          disappears: the figures next to it have just changed, and the sentence
          is what explains why. */}
      {granted !== null && (
        <p role="status" className="mt-3 text-base font-medium text-ok">
          {granted} {t.minutesAdded}
        </p>
      )}

      {open && (
        <BuyMinutesModal
          pack={pack}
          dict={dict}
          locale={locale}
          onClose={() => setOpen(false)}
          onBought={onBought}
        />
      )}
    </>
  )
}
