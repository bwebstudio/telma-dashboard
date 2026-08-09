'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ResetState = { sent: boolean }

/**
 * Sends the link, and says the same thing either way.
 *
 * The answer never depends on whether the address has an account. "No such
 * user" on this screen turns the form into a way of asking which clinics are
 * clients, one email at a time, and the people asking would not be the clinics.
 *
 * Errors from Supabase are swallowed for the same reason, and logged instead:
 * a rate limit and an unknown address must not be told apart from outside.
 */
export async function requestReset(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get('email') || '').trim()
  if (!email) return { sent: true }

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, '') ?? `${proto}://${host}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirmar`,
  })
  if (error) console.error('[reset] resetPasswordForEmail', error.message)

  return { sent: true }
}
