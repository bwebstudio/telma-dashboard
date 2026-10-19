'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LOCALE_COOKIE } from '@/lib/i18n'
import { DEMO_ROLE_COOKIE, DEMO_STAGE_COOKIE, readDemoStage } from '@/lib/demo/config'

export async function setLocale(formData: FormData) {
  const locale = String(formData.get('locale') || 'pt')
  const next = String(formData.get('next') || '/')
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// Demo only: switch between the clinic view and the internal view.
export async function setDemoRole(formData: FormData) {
  const role = String(formData.get('role') || 'clinica')
  const store = await cookies()
  store.set(DEMO_ROLE_COOKIE, role, { path: '/', sameSite: 'lax' })
  redirect('/')
}

/**
 * Demo only: which morning the panel is showing.
 *
 * Rewinding to the first morning throws away whatever was done to the store
 * since, which is the point: somebody showing the panel needs to be able to
 * put it back the way a clinic finds it, having just walked through it.
 */
export async function setDemoStage(formData: FormData) {
  const stage = readDemoStage(String(formData.get('stage') || ''))
  const store = await cookies()
  store.set(DEMO_STAGE_COOKIE, stage, { path: '/', sameSite: 'lax' })
  // To the panel's front door rather than back where they were: the first
  // morning has no agenda to return to, and half the screens do not exist yet.
  redirect('/hoje')
}
