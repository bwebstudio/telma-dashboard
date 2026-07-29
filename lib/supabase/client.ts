'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseUrl, supabaseAnonKey } from './env'

// Browser client, used for realtime subscriptions on the clinic HOJE screen.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
