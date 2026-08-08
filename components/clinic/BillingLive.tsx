'use client'

import { useRealtime } from '@/hooks/useRealtime'

/**
 * Keeps the minutes bar and the receipts current.
 *
 * Two things move underneath these screens without anybody touching them: the
 * meter, every time Telma finishes a call, and the receipts, when a purchase
 * lands. Both are rows this clinic already has permission to read, so the
 * subscription carries no data the page did not already show.
 *
 * Renders nothing. The visible "live" indicator on the agenda is LiveBar's job;
 * two green dots on one screen would be two claims about the same connection.
 */
export function BillingLive({ clinicId }: { clinicId: string }) {
  useRealtime(`billing-${clinicId}`, [
    // The clinic row carries usage_this_month and active_addons.
    { table: 'clinics', event: 'UPDATE', filter: `id=eq.${clinicId}` },
    { table: 'purchases', event: 'INSERT', filter: `clinic_id=eq.${clinicId}` },
    // The meter itself. A call ending is what moves the bar, and it moves this
    // row rather than the clinic's.
    { table: 'usage', event: '*', filter: `clinic_id=eq.${clinicId}` },
  ])

  return null
}
