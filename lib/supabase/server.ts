import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isDemo, DEMO_ROLE_COOKIE } from '@/lib/demo/config'
import { createDemoClient } from '@/lib/demo/client'
import { DEMO_CLINIC_ID } from '@/lib/demo/data'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Supabase client bound to the current request cookies. Reading cookies makes
// any page using it dynamic, which is what we want for authenticated data.
export async function createClient() {
  const cookieStore = await cookies()

  // Demo mode: serve the in memory store, scoped like RLS would scope it.
  if (isDemo()) {
    const role = cookieStore.get(DEMO_ROLE_COOKIE)?.value ?? 'clinica'
    return createDemoClient(role === 'interno' ? undefined : DEMO_CLINIC_ID)
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component where cookies cannot be set.
            // The middleware refreshes the session instead.
          }
        },
      },
    }
  )
}
