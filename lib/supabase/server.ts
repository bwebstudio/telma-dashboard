import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isDemo, DEMO_ROLE_COOKIE } from '@/lib/demo/config'
import { createDemoClient } from '@/lib/demo/client'
import { DEMO_CLINIC_ID, DEMO_REP_PT } from '@/lib/demo/data'
import { supabaseUrl, supabaseAnonKey } from './env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Supabase client bound to the current request cookies. Reading cookies makes
// any page using it dynamic, which is what we want for authenticated data.
export async function createClient() {
  const cookieStore = await cookies()

  // Demo mode: serve the in memory store, scoped like RLS would scope it.
  // Only a clinic user is scoped to one clinic; internal roles see everything.
  if (isDemo()) {
    const role = cookieStore.get(DEMO_ROLE_COOKIE)?.value ?? 'clinica'
    return createDemoClient(
      role === 'clinica' ? DEMO_CLINIC_ID : undefined,
      role === 'comercial' ? DEMO_REP_PT : undefined
    )
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
