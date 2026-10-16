'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'

/**
 * The clinic says it has dialled the code.
 *
 * We cannot check. A forward lives in an operator's switch, and the only way
 * to know would be to ring the clinic's own number and listen, which is not
 * something to do behind somebody's back. So this is a note, not a fact, and
 * it is written by the clinic about itself.
 *
 * Only the clinic, never an administrator visiting: the one thing this flag
 * does is take a task off somebody's agenda, and taking a task off somebody
 * else's agenda is how a task gets forgotten.
 *
 * Stored inside `porting_details`, beside the number and the operator and the
 * choice of which calls to send over. Those four are one fact -- how this
 * clinic's line is pointed at ours -- and splitting a column off for the last
 * of them would be a migration to store a boolean.
 */
export async function markForwardingDone(): Promise<{ ok: boolean }> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) return { ok: false }
  const cid = user.clinic_id
  const supabase = await createClient()

  // Read first, so the merge keeps the number, the operator and the choice.
  // A plain update of the column would replace the object and lose the three
  // fields the sign-up wrote into it.
  const { data: clinic } = await supabase
    .from('clinics')
    .select('porting_details')
    .eq('id', cid)
    .maybeSingle()

  const details =
    clinic?.porting_details && typeof clinic.porting_details === 'object'
      ? (clinic.porting_details as Record<string, unknown>)
      : {}

  const { error } = await supabase
    .from('clinics')
    .update({ porting_details: { ...details, forward_done: true } })
    .eq('id', cid)
  if (error) return { ok: false }

  revalidatePath('/hoje')
  revalidatePath('/conta')
  return { ok: true }
}
