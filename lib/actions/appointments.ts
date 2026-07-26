'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'

async function logActivity(type: string, message: string, clinicId: string) {
  const supabase = await createClient()
  // Clinic users cannot write activity_log under RLS, so this is best effort
  // and only lands for internal users. The webhook logs the main events.
  await supabase.from('activity_log').insert({ clinic_id: clinicId, type, message })
}

function refresh() {
  revalidatePath('/marcacoes')
  revalidatePath('/hoje')
}

export async function confirmAppointment(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'confirmada', decided_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  refresh()
}

export async function markCopied(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'copiada' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  refresh()
}

export async function alterAppointment(id: string, scheduledAtISO: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({
      scheduled_at: new Date(scheduledAtISO).toISOString(),
      status: 'confirmada',
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  refresh()
}

export async function rejectAppointment(id: string, reason: string) {
  const supabase = await createClient()
  const user = await getAppUser()
  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'rejeitada',
      reject_reason: reason || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  if (user?.role === 'interno' && user.clinic_id) {
    await logActivity('appointment_rejected', 'Marcacao rejeitada', user.clinic_id)
  }
  refresh()
}
