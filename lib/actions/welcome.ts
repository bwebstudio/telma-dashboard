'use server'

import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'

/**
 * This person has been welcomed.
 *
 * Written when the tour ends and also when it is abandoned, because they are
 * the same fact: they were offered it. Showing it again tomorrow to somebody
 * who closed it is the product arguing with them.
 *
 * Idempotent through `is null`, so a double click or a second tab does not
 * move the timestamp. It never clears: there is no way back to not having
 * been welcomed, and an action that could unset this would be a way to make
 * every clinic meet the tour again at once.
 *
 * No revalidate. The layout reads the flag on the next navigation anyway, and
 * revalidating here would tear down the panel underneath a tour that is still
 * pointing at parts of it.
 */
export async function markWelcomed(): Promise<{ ok: boolean }> {
  const user = await getAppUser()
  if (!user) return { ok: false }
  const supabase = await createClient()
  const { error } = await supabase
    .from('users')
    .update({ welcomed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('welcomed_at', null)
  return { ok: !error }
}
