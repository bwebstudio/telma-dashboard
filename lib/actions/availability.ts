'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'

const pad = (n: number) => String(n).padStart(2, '0')
const hourToTime = (h: number) => `${pad(h)}:00:00`

// Opening hours belong to the clinic that keeps them. The administrator reads
// them from inside a client's panel but never sets them: a schedule changed by
// somebody who is not there is a patient sent to a closed door.
async function clinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

// Toggle one hour on one weekday on or off for this clinic.
export async function toggleSlot(weekday: number, hour: number) {
  const supabase = await createClient()
  const cid = await clinicId()
  const start = hourToTime(hour)

  const { data: existing } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('clinic_id', cid)
    .eq('weekday', weekday)
    .eq('start_time', start)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('availability_slots').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('availability_slots').insert({
      clinic_id: cid,
      weekday,
      start_time: start,
      end_time: hourToTime((hour + 1) % 24),
      capacity: 1,
      active: true,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath('/horarios')
}

export async function addBlockedDay(day: string, reason: string) {
  const supabase = await createClient()
  const cid = await clinicId()
  const { error } = await supabase
    .from('blocked_days')
    .insert({ clinic_id: cid, day, reason: reason || null })
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}

export async function removeBlockedDay(id: string) {
  const supabase = await createClient()
  const cid = await clinicId()
  const { error } = await supabase
    .from('blocked_days')
    .delete()
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}
