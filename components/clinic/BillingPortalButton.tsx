'use client'

import { useState, useTransition } from 'react'
import { openBillingPortal } from '@/lib/actions/billing-portal'

/**
 * The one button for invoices, card and cancellation.
 *
 * It opens a session rather than linking to one, because a portal link is
 * short-lived and tied to a customer: a stored link in a page somebody left
 * open all afternoon is a dead end with no explanation.
 *
 * `window.location.assign` and not a new tab. It is their own billing, and
 * they come back with the back button; a tab that appears is one more thing
 * to close.
 */
export function BillingPortalButton({
  label,
  opening,
  failed,
  readOnly,
}: {
  label: string
  opening: string
  failed: string
  readOnly: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  if (readOnly) return null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(false)
            const r = await openBillingPortal()
            if (r.url) window.location.assign(r.url)
            else setError(true)
          })
        }
        className="btn-secondary min-h-0 px-4 py-2 text-sm"
      >
        {pending ? opening : label}
      </button>
      {error && (
        <span role="alert" className="text-sm text-danger">
          {failed}
        </span>
      )}
    </div>
  )
}
