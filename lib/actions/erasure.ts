'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUser } from '@/lib/auth'

/**
 * The clinic erasing a patient, itself, in the minute the patient asks.
 *
 * The request never comes to us. It arrives at the clinic, by telephone or at
 * the desk, and the legal deadline is a month. Routing it through an email to
 * us would spend that month on our inbox, so the clinic does it: they are the
 * controller, we are the processor, and this is one of the few things that is
 * genuinely theirs to decide.
 *
 * Two steps and not one, deliberately. `previewPatientData` shows what is held
 * before anything is touched, because an irreversible button with no preview is
 * a button nobody presses, and the one who does presses it on the wrong number.
 */

async function clinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

export interface PatientData {
  appointments: number
  calls: number
  names: string[]
}

export async function previewPatientData(phone: string): Promise<PatientData> {
  const cid = await clinicId()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('find_patient_data', {
    p_clinic_id: cid,
    p_phone: phone,
  })
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as Partial<PatientData>
  return { appointments: r.appointments ?? 0, calls: r.calls ?? 0, names: r.names ?? [] }
}

export interface ErasureResult {
  appointments_anonymised: number
  calls_redacted: number
  activity_deleted: number
}

export async function erasePatient(phone: string, reference: string): Promise<ErasureResult> {
  const supabase = await createClient()
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')

  // Through the user's own client, so the row-level policies apply and an
  // administrator looking at a client's panel cannot erase somebody else's
  // patient from inside it.
  const { error: check } = await supabase
    .from('clinics')
    .select('id')
    .eq('id', user.clinic_id)
    .single()
  if (check) throw new Error('forbidden')

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('erase_patient', {
    p_clinic_id: user.clinic_id,
    p_phone: phone,
    p_reference: reference || null,
    p_actor: user.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/conta')
  revalidatePath('/marcacoes')
  return data as ErasureResult
}
