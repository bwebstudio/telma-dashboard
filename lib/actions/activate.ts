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
    supabase
      .from('clinics')
      .select('services, custom_services, status, phone_provider_ref')
      .eq('id', cid)
      .maybeSingle(),
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

  // ── THROUGH THE ADMIN CLIENT, AND CHECKED ───────────────────────────────
  // A clinic may read its own row and may not write it: the only write policy
  // on `clinics` is the internal one, which is why every other setting on
  // this panel is saved through the admin client too. This was the one that
  // was not, and row level security does not raise an error for an update
  // that matches nothing -- it quietly changes no rows. So the button worked,
  // the page refreshed, the status stayed `por_configurar`, and the clinic
  // pressed it again. It is the only thing on this screen they can do, and
  // for the first real client it did nothing at all.
  //
  // The reach is not widened by this: the clinic is `user.clinic_id`, read
  // from the session above, and the update is pinned to it and to the one
  // status it may be left.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: activated, error } = await createAdminClient()
    .from('clinics')
    .update({ status: 'ativa' })
    .eq('id', cid)
    .eq('status', 'por_configurar')
    .select('id')
    .maybeSingle()

  // Nothing changed is a failure, not a success. Returning ok on an update
  // that touched no rows is what made this invisible for a week.
  if (error || !activated) return { ok: false }

  // ── AND THE SCREEN THE BUTTON WAS ON ──────────────────────────────────
  // The set-up moved to /comecar, which sends an active clinic to the agenda.
  // Without revalidating it, pressing activate left the clinic looking at the
  // form it had just finished, with nothing to say it had worked.
  revalidatePath('/comecar')
  revalidatePath('/hoje')
  revalidatePath('/telma')
  revalidatePath('/horarios')
  return { ok: true }
}
