'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { flushQueue, pendingCount } from '@/lib/crm/queue'

// Two jobs that always belong together on a CRM screen:
//
// 1. Realtime. If the admin reassigns a clinic, or another rep logs a call on
//    a shared one, the list updates without anyone pulling to refresh.
// 2. The outbox. Anything the phone saved while out of coverage is retried on
//    mount, whenever the browser reports it is back online, and every 30s so a
//    silent recovery is picked up too.

function isSupabaseConfigured(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO !== '1' && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  )
}

export function CrmLive({
  channel,
  prospectId,
  liveLabel,
  queuedLabel,
}: {
  channel: string
  prospectId?: string
  liveLabel: string
  queuedLabel: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(true)

  const drain = useCallback(async () => {
    const before = pendingCount()
    if (before === 0) {
      setPending(0)
      return
    }
    const left = await flushQueue()
    setPending(left)
    if (left < before) router.refresh()
  }, [router])

  useEffect(() => {
    setPending(pendingCount())
    setOnline(navigator.onLine)
    void drain()

    const onOnline = () => {
      setOnline(true)
      void drain()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = window.setInterval(() => void drain(), 30_000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.clearInterval(timer)
    }
  }, [drain])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const filter = prospectId ? `id=eq.${prospectId}` : undefined
    const activityFilter = prospectId ? `prospect_id=eq.${prospectId}` : undefined

    const sub = supabase
      .channel(channel)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_prospects', ...(filter ? { filter } : {}) },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crm_activities',
          ...(activityFilter ? { filter: activityFilter } : {}),
        },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [channel, prospectId, router])

  return (
    <span className="inline-flex items-center gap-3 text-sm text-ink-mute">
      <span className="inline-flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {online && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              online ? 'bg-ok' : 'bg-warn'
            }`}
          />
        </span>
        {/* The dot says it on a phone; the sentence is for wider screens. */}
        <span className="sr-only sm:not-sr-only">{liveLabel}</span>
      </span>
      {pending > 0 && (
        <span className="badge bg-warn-soft text-warn" role="status">
          {pending} · {queuedLabel}
        </span>
      )}
    </span>
  )
}
