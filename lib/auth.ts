import { cookies } from 'next/headers'
import { createClient } from './supabase/server'
import { isDemo, DEMO_ROLE_COOKIE } from './demo/config'
import { getDemoUser } from './demo/data'
import type { AppUser, UserRole } from './types'

// The authenticated app user, joined with their clinic (null for internal).
// Returns null when there is no valid session.
export async function getAppUser(): Promise<AppUser | null> {
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
}
