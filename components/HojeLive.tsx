'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Subscribes to this clinic's calls and appointments and refreshes the server
// component when anything changes, so HOJE updates without a manual reload.
export function HojeLive({ clinicId, label }: { clinicId: string; label: string }) {
  const router = useRouter()

  useEffect(() => {
    // In demo mode there is no Supabase to subscribe to.
    if (process.env.NEXT_PUBLIC_DEMO === '1' || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
    const supabase = createClient()
    const channel = supabase
      .channel(`hoje-${clinicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinicId}` },
        () => router.refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `clinic_id=eq.${clinicId}` },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clinicId, router])

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-mute">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
      </span>
      {label}
    </span>
  )
}
