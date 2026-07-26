import { createClient } from '@supabase/supabase-js'
import { isDemo } from '@/lib/demo/config'
import { createDemoClient } from '@/lib/demo/client'

// Service role client. Server only. Bypasses Row Level Security, so it is used
// exclusively by the voice webhooks to write across clinics. Never import this
// into client components.
export function createAdminClient() {
  // Demo mode: unscoped in memory client, mirroring the service role reach.
  if (isDemo()) return createDemoClient()

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
