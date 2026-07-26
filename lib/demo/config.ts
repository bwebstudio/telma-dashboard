// Demo mode lets you browse the whole panel without a Supabase project.
// It turns on when Supabase is not configured, or when forced with
// NEXT_PUBLIC_DEMO=1. Works on both server and client (NEXT_PUBLIC_* is inlined).
export function isDemo(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // No URL, or the unedited placeholder from .env.example, means "not
  // configured yet": fall back to the browsable demo instead of failing auth.
  return !url || url.includes('YOUR-PROJECT')
}

export const DEMO_ROLE_COOKIE = 'telma_demo_role'
