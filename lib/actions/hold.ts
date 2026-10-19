'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { getVisitingClinic } from '@/lib/clinic-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { notifyPatient } from '@/lib/notify-patient'

/**
 * Apply the deadline that has already passed.
 *
 * Called by the panel when a countdown on screen reaches zero. Not a decision
 * the clinic is making — the window closed on its own — which is why the
 * administrator visiting a panel may trigger it too: bookkeeping is not an edit,
 * and a visitor watching a hold lapse should see the same agenda the clinic
 * would.
 *
 * The database is the one that decides what has lapsed. This passes no
 * timestamp: a browser with a wrong clock must not be able to expire a booking
 * that still has twenty minutes left on it.
 */
export async function expireLapsedPreAppointments(): Promise<{ expired: number }> {
  const clinicId = await currentClinicId()
  if (!clinicId) return { expired: 0 }
  // Demo mode has no such function, and the demo store expires nothing.
  if (isDemo()) return { expired: 0 }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('expire_stale_preappointments', {
    p_clinic_id: clinicId,
  })
  if (error) return { expired: 0 }

  const lapsed = (data ?? []) as Array<{ id: string }>

  // ── AND THE PERSON WHO ASKED FOR IT ─────────────────────────────────────
  // The hour went back on sale and the only one who still believed they had
  // an appointment was the patient. They would have turned up. The sweep is
  // the gate: only a booking that was 'pendente' a moment ago is in this
  // list, so each one is told exactly once however many times this runs.
  //
  // After the status, never before, and never fatal: a message that will not
  // send must not leave the hour held.
  for (const row of lapsed) {
    try {
      await notifyPatient(row.id, 'expirada')
    } catch (e) {
      console.error('[hold] expiry notice', e instanceof Error ? e.message : e)
    }
  }

  if (lapsed.length > 0) revalidatePath('/', 'layout')
  return { expired: lapsed.length }
}

async function currentClinicId(): Promise<string | null> {
  const user = await getAppUser()
  if (!user) return null
  if (user.role === 'clinica') return user.clinic_id ?? null
  const visiting = await getVisitingClinic()
  return visiting?.id ?? null
}
