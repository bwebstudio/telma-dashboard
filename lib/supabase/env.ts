// One place that reads the Supabase environment, and the only place allowed to
// decide whether it is usable.
//
// These values are pasted by hand into the Vercel dashboard, and pasting goes
// wrong in predictable ways: surrounding quotes, a trailing newline, a leading
// space, or the Postgres connection string instead of the project URL. Left
// unchecked, supabase-js throws "Invalid supabaseUrl" from inside the
// middleware, which Vercel surfaces as MIDDLEWARE_INVOCATION_FAILED with no
// hint about which variable is at fault.
//
// So: clean up what can be cleaned up, and for the rest produce a message that
// names the variable and what is wrong with it.

// The unedited placeholder from .env.example. Means "not configured yet".
const PLACEHOLDER = 'YOUR-PROJECT'

function clean(value: string | undefined): string {
  if (!value) return ''
  let v = value.trim()
  // Some shells and paste targets keep the quotes around the value.
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim()
  }
  return v
}

export const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
export const supabaseAnonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export function isPlaceholderUrl(value: string): boolean {
  return value.includes(PLACEHOLDER)
}

// Null when the environment is fine. Otherwise a sentence that says which
// variable to fix and how. Never includes a key, so it is safe to show.
export function supabaseConfigError(): string | null {
  if (!supabaseUrl || isPlaceholderUrl(supabaseUrl)) return null // not configured: demo mode

  let parsed: URL
  try {
    parsed = new URL(supabaseUrl)
  } catch {
    return `NEXT_PUBLIC_SUPABASE_URL is not a URL. It must be exactly https://<project-ref>.supabase.co (got ${supabaseUrl.length} characters starting with "${supabaseUrl.slice(0, 12)}").`
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `NEXT_PUBLIC_SUPABASE_URL uses "${parsed.protocol}". That looks like a database connection string, not the project URL. Use https://<project-ref>.supabase.co, from Supabase > Project Settings > Data API.`
  }

  if (!supabaseAnonKey) {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY is empty. Copy the publishable key from Supabase > Project Settings > API Keys.'
  }

  return null
}
