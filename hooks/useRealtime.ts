'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimeWatch {
  table: string
  /** PostgREST filter, e.g. `clinic_id=eq.<uuid>`. Always scope by clinic. */
  filter?: string
  event?: RealtimeEvent
}

/**
 * Subscribe to rows changing and re-render the server component that drew them.
 *
 * The panel's data comes from server components, so the honest way to update it
 * is to ask the server again rather than to patch a copy in the browser: the
 * page then reflects what the database actually holds, including anything the
 * change implied elsewhere on the screen. A push that only carried the new row
 * would leave the counters next to it stale.
 *
 * Every subscription is filtered by clinic. Realtime respects RLS, so a filter
 * is not what keeps one clinic out of another's rows, but an unfiltered channel
 * would wake every open panel in the country on every write.
 */
export function useRealtime(
  channelName: string,
  watches: RealtimeWatch[],
  onChange?: () => void
): void {
  const router = useRouter()

  // The watches are written inline at the call site, so they are a new array on
  // every render. Comparing them by value is what keeps this from tearing the
  // socket down and building it again four times a second.
  const key = JSON.stringify(watches)

  const handler = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    handler.current = onChange
  }, [onChange])

  useEffect(() => {
    // Demo mode has no Supabase to subscribe to, and nothing changes underneath
    // the demo anyway.
    if (process.env.NEXT_PUBLIC_DEMO === '1' || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

    const supabase = createClient()
    const channel = supabase.channel(channelName)
    const list = JSON.parse(key) as RealtimeWatch[]

    for (const watch of list) {
      channel.on(
        // supabase-js types this argument as a literal, and the watches are
        // built at runtime, so the shape is asserted rather than inferred.
        'postgres_changes' as never,
        {
          event: watch.event ?? '*',
          schema: 'public',
          table: watch.table,
          ...(watch.filter ? { filter: watch.filter } : {}),
        } as never,
        (() => {
          if (handler.current) handler.current()
          else router.refresh()
        }) as never
      )
    }

    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, key, router])
}
