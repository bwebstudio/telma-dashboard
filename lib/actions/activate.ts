'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'
import { setupSteps, readyToActivate } from '@/lib/clinic-setup'

/**
 * Turning Telma on, and only the clinic may do it.
 *
 * The button is disabled until the list is complete, and this checks the same
 * list again on the server. A disabled button is a courtesy to the reader, not
 * a rule: the rule is here, where nobody can click past it.
 *
 * An administrator visiting cannot press it. Deciding that a clinic is ready
 * to answer its own telephone is the clinic's decision, and the moment it
 * starts answering is the moment it starts spending its minutes.
 */
export async function activateClinic(): Promise<{ ok: boolean; missing?: string[] }> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) return { ok: false }
  const cid = user.clinic_id
  const supabase = await createClient()

  const [{ data: clinic }, { count }] = await Promise.all([
    supabase.from('clinics').select('services, custom_services, status').eq('id', cid).maybeSingle(),
    // `availability_slots`, which is where the opening hours live. `hours`
    // is not a table: getting this wrong would have left the button disabled
    // for every clinic for ever, and the only symptom would have been nobody
    // ever activating.
    supabase
      .from('availability_slots')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', cid),
  ])

  const steps = setupSteps(clinic as never, count ?? 0)
  if (!readyToActivate(steps)) {
    return { ok: false, missing: steps.filter((s) => !s.done).map((s) => s.id) }
  }

  // Only from the state this exists for. A paused clinic is paused for a
  // reason -- an unpaid invoice, usually -- and that is not a button on its
  // own panel; a cancelled one is gone.
  const { error } = await supabase
    .from('clinics')
    .update({ status: 'ativa' })
    .eq('id', cid)
    .eq('status', 'por_configurar')
  if (error) return { ok: false }

  revalidatePath('/hoje')
  revalidatePath('/telma')
  revalidatePath('/horarios')
  return { ok: true }
}
