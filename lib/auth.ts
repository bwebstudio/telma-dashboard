import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from './supabase/server'
import { isDemo, DEMO_ROLE_COOKIE } from './demo/config'
import { getDemoUser } from './demo/data'
import type { AppUser, UserRole } from './types'

// The authenticated app user, joined with their clinic (null for internal).
// Returns null when there is no valid session.
// Wrapped in cache() so the layout, the page and getLocale() share a single
// lookup per request instead of hitting Supabase three times.
export const getAppUser = cache(async function getAppUser(): Promise<AppUser | null> {
  if (isDemo()) {
    const store = await cookies()
    const role = (store.get(DEMO_ROLE_COOKIE)?.value ?? 'clinica') as UserRole
    return getDemoUser(role)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('*, clinic:clinics(*)')
    .eq('id', user.id)
    .single()

  if (!data) return null
  return { ...data, email: data.email ?? user.email ?? null } as AppUser
})

// The CRM is for the sales team only: the founding team (interno, full reach)
// and the reps (comercial, scoped to their own prospects by RLS).
export function isCrmUser(user: AppUser | null): boolean {
  return user?.role === 'interno' || user?.role === 'comercial'
}

// CRM admin: sees every rep, every country, and reassigns prospects.
export function isCrmAdmin(user: AppUser | null): boolean {
  return user?.role === 'interno'
}

// Where a user lands after signing in.
//
// Somebody can be both admin and rep: Domingos runs the team and also spends the
// day calling clinics. For him the useful first screen is his own list of calls,
// not the client operation, so anyone carrying an active rep row starts in the
// CRM. A pure internal user starts on the client panel.
export async function resolveHomePath(user: AppUser): Promise<string> {
  if (user.role === 'clinica') return '/hoje'
  if (user.role === 'comercial') return '/crm/hoje'

  const supabase = await createClient()
  const { data } = await supabase
    .from('crm_reps')
    .select('id')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle()

  return data ? '/crm/hoje' : '/clinicas'
}
