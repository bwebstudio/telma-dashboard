import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { createClient } from './supabase/server'
import { VERIFIED_USER_HEADER } from './supabase/middleware'
import { canOpenPanel, isAdmin } from './access'
import { isDemo, DEMO_ROLE_COOKIE, DEMO_STAGE_COOKIE, readDemoStage } from './demo/config'
import { applyDemoStage, getDemoUser } from './demo/data'
import type { AppUser, UserRole } from './types'

// The authenticated app user, joined with their clinic (null for internal).
// Returns null when there is no valid session.
// Wrapped in cache() so the layout, the page and getLocale() share a single
// lookup per request instead of hitting Supabase three times.
export const getAppUser = cache(async function getAppUser(): Promise<AppUser | null> {
  if (isDemo()) {
    const store = await cookies()
    const role = (store.get(DEMO_ROLE_COOKIE)?.value ?? 'clinica') as UserRole
    // Here too, and not only in createClient: whether this person has been
    // welcomed is read straight off the store, and the tour turns on it.
    applyDemoStage(readDemoStage(store.get(DEMO_STAGE_COOKIE)?.value))
    return getDemoUser(role)
  }

  const supabase = await createClient()

  // ── WHO, WITHOUT ASKING TWICE ────────────────────────────────────────────
  // The middleware verified this request's token against Supabase a moment
  // ago and wrote the id it got back on the request. Reading it here saves a
  // second round trip to the auth endpoint on every single page load, which
  // is the slowest thing the panel used to do before it could start. The
  // header cannot come from the browser: the middleware deletes any copy of
  // it before setting its own. See lib/supabase/middleware.
  //
  // Asking properly is still the fallback, for anything that somehow arrives
  // without having passed through there.
  const verified = (await headers()).get(VERIFIED_USER_HEADER)
  const id = verified ?? (await supabase.auth.getUser()).data.user?.id
  if (!id) return null

  const { data } = await supabase
    .from('users')
    .select('*, clinic:clinics(*)')
    .eq('id', id)
    .single()

  if (!data) return null

  // The row usually carries the address. When it does not, the only other
  // place it lives is the auth user, and that is worth the round trip because
  // it is what the panel greets them by -- but only then, and not on the
  // ordinary load where the row already has it.
  const email =
    data.email ?? (await supabase.auth.getUser()).data.user?.email ?? null

  return { ...data, email } as AppUser
})

// The CRM is for the sales team only: the administrator (interno, full reach)
// and the reps (comercial, scoped to their own prospects by RLS).
export function isCrmUser(user: AppUser | null): boolean {
  return canOpenPanel(user, 'crm')
}

// CRM admin: sees every rep, every country, and reassigns prospects.
export const isCrmAdmin = isAdmin
