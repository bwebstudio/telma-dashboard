'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { isAdmin } from '@/lib/access'
import { VIEW_CLINIC_COOKIE } from '@/lib/clinic-context'

// Open a client's panel as the administrator, from that clinic's file.
//
// It is a session-lived cookie on purpose: closing the browser closes the
// visit, so nobody comes back the next morning still inside somebody else's
// clinic without noticing.
export async function openClinicPanel(formData: FormData) {
  const user = await getAppUser()
  if (!isAdmin(user)) redirect('/')

  const id = String(formData.get('clinic_id') || '')
  if (!id) redirect('/clinicas')

  const store = await cookies()
  store.set(VIEW_CLINIC_COOKIE, id, { path: '/', sameSite: 'lax', httpOnly: true })
  redirect('/hoje')
}

export async function closeClinicPanel(formData: FormData) {
  const store = await cookies()
  const id = store.get(VIEW_CLINIC_COOKIE)?.value
  store.delete(VIEW_CLINIC_COOKIE)
  redirect(id ? `/clinicas/${id}` : '/clinicas')
}
