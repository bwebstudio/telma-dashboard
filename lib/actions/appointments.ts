'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'
import { notifyPatient } from '@/lib/notify-patient'

// Answering a patient is the clinic's decision and carries the clinic's name,
// so only the clinic that owns the booking may write it. The administrator can
// read a client's panel but never answers in its place, and a sales rep has no
// business here at all.
//
// Every write is scoped by clinic_id as well as by id: guessing an id from
// another clinic changes nothing.
async function writableClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

function refresh() {
  revalidatePath('/marcacoes')
  revalidatePath('/hoje')
}

export async function confirmAppointment(id: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'confirmada', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  // After the write and never before it, and it cannot throw: the clinic's
  // decision is the thing that matters and a dead SMS must not undo it. Telma
  // ends every booking saying it is subject to the clinic confirming, and this
  // is the half of that sentence that never used to travel.
  await notifyPatient(id, 'confirmada')
  refresh()
}

/**
 * Calling off a booking that was already confirmed.
 *
 * There was no way to do this. A confirmed appointment offered one button,
 * "copy the details", and anything after that happened in somebody's own
 * software with the patient none the wiser. The clinic closes for a funeral,
 * a dentist is ill, a room floods: the slot is gone and the only person who
 * does not know is the one who is going to turn up.
 *
 * 'cancelada' and not 'rejeitada': one is a booking that existed and stopped
 * existing, the other is a booking the clinic never accepted. They read
 * differently in the agenda and they say different things to the patient.
 * See 0011.
 */
export async function cancelAppointment(id: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'cancelada',
      decided_at: new Date().toISOString(),
      // The clinic did this and already knows. The alert band is for a
      // cancellation the clinic has not seen yet, which is the patient's.
      cancel_seen_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('clinic_id', cid)
    .in('status', ['confirmada', 'copiada', 'pendente'])
  if (error) throw new Error(error.message)
  // After the write, never before, and it cannot undo it. Somebody who is not
  // told keeps the appointment in their diary.
  await notifyPatient(id, 'cancelada')
  refresh()
}

export async function markCopied(id: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'copiada' })
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  refresh()
}

export async function alterAppointment(id: string, scheduledAtISO: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({
      scheduled_at: new Date(scheduledAtISO).toISOString(),
      status: 'confirmada',
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  // 'alterada' and not 'confirmada': moving an hour is the one thing a patient
  // must not find out by turning up at the old one, and the kind is also what
  // lets a second message go out after a first.
  await notifyPatient(id, 'alterada')
  refresh()
}

// "I know about this one." Takes the cancellation out of the alert band
// without touching the booking itself: the slot stays cancelled, the agenda
// still shows it, and the record of when the clinic noticed is kept.
export async function acknowledgeCancellation(id: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ cancel_seen_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', cid)
    .eq('status', 'cancelada')
  if (error) throw new Error(error.message)
  refresh()
}

export async function rejectAppointment(id: string, reason: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'rejeitada',
      reject_reason: reason || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  await notifyPatient(id, 'rejeitada')
  refresh()
}
