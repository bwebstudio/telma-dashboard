'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'

const pad = (n: number) => String(n).padStart(2, '0')

// Opening hours belong to the clinic that keeps them. The administrator reads
// them from inside a client's panel but never sets them: a schedule changed by
// somebody who is not there is a patient sent to a closed door.
async function clinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

/**
 * The hours one weekday is open, rewritten whole.
 *
 * A window, not a list of hours. The grid this replaced could only speak in
 * whole hours, so a clinic open until quarter to ten had no way to say so, and
 * every row it wrote was exactly one appointment long, which left a longer
 * treatment nowhere to go.
 *
 * The day is replaced rather than patched. Editing opening hours is not a
 * series of small independent facts, it is one answer to one question, and
 * applying half of it is how a clinic ends up open at a time it just closed.
 */
export async function saveDayHours(
  weekday: number,
  windows: Array<{ open: string; close: string }>,
  /** Whose hours. Omitted by a clinic with one diary, which is most of them. */
  resourceId?: string
) {
  const supabase = await createClient()
  const cid = await clinicId()
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('bad_weekday')

  const clean = windows
    .map((w) => ({ open: normalise(w.open), close: normalise(w.close) }))
    .filter((w) => w.open && w.close && w.open < w.close)
    .sort((a, b) => a.open.localeCompare(b.open))

  // Two windows over the same minute would offer the same time twice, and the
  // second insert would collide on (resource, weekday, start) anyway. Caught
  // here so it reads as an answer rather than as a database error.
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].open < clean[i - 1].close) throw new Error('overlapping_windows')
  }

  const diaries = supabase.from('resources').select('id').eq('clinic_id', cid).eq('active', true)
  const { data: diary } = resourceId
    ? await diaries.eq('id', resourceId).maybeSingle()
    : await diaries.order('sort').order('created_at').limit(1).maybeSingle()
  if (!diary) throw new Error('no_resource')

  // This diary's day, not the clinic's. Wiping by clinic would have one
  // colleague's edit silently clear everybody else's Tuesday.
  const { error: wipe } = await supabase
    .from('availability_slots')
    .delete()
    .eq('clinic_id', cid)
    .eq('resource_id', (diary as { id: string }).id)
    .eq('weekday', weekday)
  if (wipe) throw new Error(wipe.message)

  if (clean.length) {
    const { error } = await supabase.from('availability_slots').insert(
      clean.map((w) => ({
        clinic_id: cid,
        resource_id: (diary as { id: string }).id,
        weekday,
        start_time: `${w.open}:00`,
        end_time: `${w.close}:00`,
        capacity: 1,
        active: true,
      }))
    )
    if (error) throw new Error(error.message)
  }
  revalidatePath('/horarios')
}

/** How often an appointment may start. The width of the grid, not the length
 *  of a treatment: those are different questions and both are asked. */
export async function setSlotStep(minutes: number) {
  const supabase = await createClient()
  const cid = await clinicId()
  const step = Math.round(Number(minutes))
  if (!Number.isFinite(step) || step < 5 || step > 240) throw new Error('bad_step')

  const { error } = await supabase.from('clinics').update({ slot_minutes: step }).eq('id', cid)
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}

/** "9:5" and "09:05" are the same time typed by two different people. */
function normalise(raw: string): string {
  const m = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})?\s*$/.exec(raw ?? '')
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2] ?? '0')
  if (h > 23 || min > 59) return ''
  return `${pad(h)}:${pad(min)}`
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

// Diaries ---------------------------------------------------------------------
// A clinic has one until it adds another, and adding another is the only thing
// that makes any of this appear. Nobody chooses a mode; they add a colleague.

export async function addResource(name: string) {
  const supabase = await createClient()
  const cid = await clinicId()
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('name_required')

  const { error } = await supabase
    .from('resources')
    .insert({ clinic_id: cid, name: clean, kind: 'profissional' })
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}

export async function renameResource(id: string, name: string) {
  const supabase = await createClient()
  const cid = await clinicId()
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('name_required')

  const { error } = await supabase
    .from('resources')
    .update({ name: clean })
    .eq('id', id)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}

/**
 * Removing a diary, but never the last one.
 *
 * The hours go with it, by the foreign key. Appointments do not: they are set
 * to null rather than deleted, because a colleague leaving is not a reason for
 * the people they were going to see to disappear from the diary, and somebody
 * has to ring them.
 */
export async function removeResource(id: string) {
  const supabase = await createClient()
  const cid = await clinicId()

  const { count } = await supabase
    .from('resources')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', cid)
  if ((count ?? 0) <= 1) throw new Error('last_resource')

  const { error } = await supabase.from('resources').delete().eq('id', id).eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  revalidatePath('/horarios')
}
