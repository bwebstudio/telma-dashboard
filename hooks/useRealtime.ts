'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

/** Counts mounts, so no two channels are ever asked for by the same name. */
let mounts = 0

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

    // Everything below is a convenience: the page already drew correct data on
    // the server, and this only keeps it current. So nothing in here is allowed
    // to take the panel down with it. A websocket that will not open, a project
    // with realtime switched off, a key format the client does not recognise —
    // all of them end with a page that does not refresh itself, which is what it
    // did before this existed, rather than with a blank screen and "a
    // client-side exception has occurred".
    let supabase: ReturnType<typeof createClient>
    let channel: ReturnType<ReturnType<typeof createClient>['channel']>
    try {
      supabase = createClient()
      // A name of its own for this mount, and not the one the caller passed.
      //
      // `supabase.channel(name)` hands back the *existing* channel when one with
      // that name is already open, and `removeChannel` finishes asynchronously.
      // So navigating from one screen to another that watches the same rows got
      // the old channel back, still subscribed, and adding listeners to it threw
      //   cannot add `postgres_changes` callbacks ... after `subscribe()`
      // which is uncaught and takes the whole page with it. Three screens
      // sharing one name made it happen on an ordinary click.
      //
      // A fresh name every time cannot collide with a channel that is still
      // closing. The caller's name stays in it so the socket is still
      // recognisable in a debugger.
      channel = supabase.channel(`${channelName}-${++mounts}`)
    } catch (e) {
      console.error('[realtime] could not open a channel', e)
      return
    }
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

    try {
      channel.subscribe()
    } catch (e) {
      console.error('[realtime] could not subscribe', e)
    }
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        /* already gone */
      }
    }
  }, [channelName, key, router])
}
