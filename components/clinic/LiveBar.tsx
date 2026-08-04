'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/content'

type Health = 'connecting' | 'live' | 'lost'

const POLL_MS = 60_000

/**
 * Keeps the agenda current, and says out loud whether it is.
 *
 * The realtime subscription is the fast path. It is not the only one: a socket
 * can die quietly — a sleeping laptop, a captive wifi, a proxy that drops idle
 * connections — and a panel that looks live while showing an hour-old agenda is
 * worse than no panel at all. A clinic that misses one cancellation because of
 * that stops trusting the product, and they would be right to.
 *
 * So there are three ways the data refreshes: the subscription, a poll every
 * minute while the tab is visible, and the moment the tab is looked at again.
 * And when the socket is down the bar says so, instead of showing a green dot
 * that means nothing.
 */
export function LiveBar({
  clinicId,
  renderedAt,
  locale,
  liveLabel,
  lostLabel,
  retryLabel,
  updatedLabel,
}: {
  clinicId: string
  /** When the server rendered this page. */
  renderedAt: string
  locale: Locale
  liveLabel: string
  lostLabel: string
  retryLabel: string
  updatedLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [health, setHealth] = useState<Health>('connecting')
  // Rendered only after mount: the server has no timezone of its own to format
  // in, and a mismatched string here is a hydration error on every load.
  const [stamp, setStamp] = useState<string | null>(null)

  const refresh = useCallback(() => {
    startTransition(() => router.refresh())
  }, [router])

  useEffect(() => {
    setStamp(
      new Date(renderedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : `${locale}-${locale === 'pt' ? 'PT' : 'ES'}`, {
        hour: '2-digit',
        minute: '2-digit',
      })
    )
  }, [renderedAt, locale])

  // The subscription.
  useEffect(() => {
    const demo =
      process.env.NEXT_PUBLIC_DEMO === '1' || !process.env.NEXT_PUBLIC_SUPABASE_URL
    if (demo) {
      // Nothing to subscribe to, and nothing changes underneath us either.
      setHealth('live')
      return
    }

    const supabase = createClient()
    const channel = supabase
      .channel(`agenda-${clinicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinicId}` },
        refresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `clinic_id=eq.${clinicId}` },
        refresh
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setHealth('live')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setHealth('lost')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, refresh])

  // The safety nets: a slow poll while the tab is visible, and a refresh the
  // moment somebody comes back to it.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  const lost = health === 'lost'

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-pill border px-3 py-1.5 text-sm ${
        lost ? 'border-warn/40 bg-warn-soft text-warn' : 'border-line-strong bg-surface text-ink-soft'
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-2">
        {lost ? (
          <span className="h-2.5 w-2.5 rounded-full bg-warn" aria-hidden />
        ) : (
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
          </span>
        )}
        {lost ? lostLabel : liveLabel}
      </span>

      {!lost && stamp && (
        <span className="text-ink-mute">
          {updatedLabel} {stamp}
        </span>
      )}

      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="font-medium underline underline-offset-4 hover:no-underline disabled:opacity-50"
      >
        {retryLabel}
      </button>
    </div>
  )
}
