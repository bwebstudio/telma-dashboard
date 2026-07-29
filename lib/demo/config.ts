import { supabaseUrl, isPlaceholderUrl } from '@/lib/supabase/env'

// Demo mode lets you browse the whole panel without a Supabase project.
// It turns on when Supabase is not configured, or when forced with
// NEXT_PUBLIC_DEMO=1. Works on both server and client (NEXT_PUBLIC_* is inlined).
export function isDemo(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true
  // No URL, or the unedited placeholder from .env.example, means "not
  // configured yet": fall back to the browsable demo instead of failing auth.
  // A URL that is present but malformed is NOT demo mode: that is a
  // misconfiguration and has to be reported, not silently faked.
  return !supabaseUrl || isPlaceholderUrl(supabaseUrl)
}

export const DEMO_ROLE_COOKIE = 'telma_demo_role'
