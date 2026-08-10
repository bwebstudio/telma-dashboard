'use client'

import { useRealtime } from '@/hooks/useRealtime'

/**
 * The agenda, current without anybody pressing anything.
 *
 * A booking arrived while the panel was open and did not appear until the page
 * was reloaded by hand. LiveBar polls, but every sixty seconds, so a call that
 * ends at the wrong moment leaves a receptionist looking at a day that no longer
 * exists. Worse in a demonstration: somebody watches a booking be made, opens
 * the agenda, and finds nothing there.
 *
 * `appointments` and `calls` have been in the realtime publication since 0002.
 * The subscription was simply never made, and only the billing card was
 * listening. Realtime respects RLS, so what arrives here is what this clinic
 * could already read, and the filter is what stops every open panel in the
 * country waking on every write.
 *
 * Renders nothing, and shows no indicator: the green dot on the agenda is
 * LiveBar's, and two of them would be two claims about one connection.
 */
export function AgendaLive({ clinicId }: { clinicId: string }) {
  useRealtime(`agenda-${clinicId}`, [
    { table: 'appointments', event: '*', filter: `clinic_id=eq.${clinicId}` },
    { table: 'calls', event: '*', filter: `clinic_id=eq.${clinicId}` },
  ])

  return null
}
