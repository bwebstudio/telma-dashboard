'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/auth'
import { buildSlots } from '@/lib/onboarding/schedule'
import { wizardSchemas } from '@/lib/onboarding/wizard-schema'
import {
  DEFAULT_ONBOARDING_LOCALE,
  type OnboardingLocale,
} from '@/lib/onboarding/locale'

/**
 * The opening hours, written from the shape the guided setup asks for.
 *
 * Two representations of the same fact live in this project, and that is on
 * purpose. `availability_slots` is one row per weekday per stretch, which is
 * what the diary reads and what /horarios edits once a clinic knows what it
 * wants. The setup asks a much smaller question -- weekdays, Saturday, Sunday,
 * and a midday break -- because a clinic that has not opened the panel before
 * should not meet a grid.
 *
 * `buildSlots` is the one-way door between them, and it is the same function
 * the sign-up used when the sign-up still asked this. Nothing converts back:
 * once a clinic refines its week in /horarios, that grid is the truth and this
 * screen is not shown again.
 */
export async function saveSetupHours(
  values: unknown,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) {
    return { ok: false, errors: { _form: 'unauthorized' } }
  }
  const cid = user.clinic_id

  const parsed = wizardSchemas(locale).hours.safeParse(values)
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_form')
      if (!errors[key]) errors[key] = issue.message
    }
    return { ok: false, errors }
  }

  const supabase = await createClient()

  // The diary this clinic books into, so the rows hang off the same resource
  // the sign-up would have used. A clinic has one at this point; if it somehow
  // has none the slots are still written, unattached, which is what the diary
  // falls back to reading.
  const { data: diary } = await supabase
    .from('resources')
    .select('id')
    .eq('clinic_id', cid)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const rows = buildSlots(parsed.data as never).map((s) => ({
    ...s,
    clinic_id: cid,
    resource_id: (diary as { id: string } | null)?.id ?? null,
  }))

  // Replaced, not added to. Somebody who goes back a step, changes Saturday
  // and continues would otherwise end up with both answers in the diary and a
  // clinic open at two different times on the same day.
  const { error: wipe } = await supabase.from('availability_slots').delete().eq('clinic_id', cid)
  if (wipe) return { ok: false, errors: { _form: wipe.message } }

  if (rows.length) {
    const { error } = await supabase.from('availability_slots').insert(rows)
    if (error) return { ok: false, errors: { _form: error.message } }
  }

  revalidatePath('/comecar')
  revalidatePath('/horarios')
  revalidatePath('/hoje')
  return { ok: true }
}
