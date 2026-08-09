'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type NewPasswordState = { error: 'short' | 'mismatch' | 'expired' | null }

export async function setNewPassword(
  _prev: NewPasswordState,
  formData: FormData
): Promise<NewPasswordState> {
  const password = String(formData.get('password') || '')
  const repeat = String(formData.get('repeat') || '')

  // Checked here as well as in the browser. The browser check is for the person
  // typing; this one is what actually holds, because a form is only a
  // suggestion about what will be sent.
  if (password.length < 8) return { error: 'short' }
  if (password !== repeat) return { error: 'mismatch' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: 'expired' }

  // Straight in, rather than back to the sign-in form. They have just proved
  // the address is theirs and typed the password twice; asking for it a third
  // time is asking for nothing.
  redirect('/')
}
