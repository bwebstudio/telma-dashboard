'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { writeClinicOverride } from '@/lib/demo/overrides'
import { store } from '@/lib/demo/data'

/**
 * How this clinic wants pre-marcações handled.
 *
 * The clinic id is never taken from the form. It comes from the session, so a
 * crafted request cannot change the settings of a clinic the sender does not
 * belong to — the id in a hidden field is a suggestion, and this does not read
 * suggestions.
 *
 * Written with the service role because `clinics` has no row-level policy
 * letting a clinic write its own row; only the internal team may. The
 * authorisation is the line above the write instead: role, and the clinic that
 * role belongs to.
 */
async function ownClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

export async function updatePreAppointmentHoldConfig(formData: FormData): Promise<void> {
  const autoExpires = String(formData.get('auto_expires')) === 'true'
  const clinicId = await ownClinicId()

  if (isDemo()) {
    writeClinicOverride(clinicId, { pre_appointment_auto_expires: autoExpires })
    // The store as well as the override bag: the demo's stand-in for
    // record_call reads the clinic row to decide whether a new pre-marcação
    // gets a deadline, exactly as the trigger does.
    const demoClinic = store.clinics.find((c) => c.id === clinicId)
    if (demoClinic) demoClinic.pre_appointment_auto_expires = autoExpires
    // The demo has no trigger to release the bookings already counting down, so
    // the same thing the real branch does below is done by hand. Without it the
    // demo would show the setting changing and the countdowns carrying on, and
    // the one thing this screen is for would look broken.
    if (!autoExpires) {
      for (const appointment of store.appointments) {
        if (appointment.clinic_id === clinicId && appointment.status === 'pendente') {
          appointment.expires_at = null
        }
      }
    }
    revalidatePath('/', 'layout')
    return
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ pre_appointment_auto_expires: autoExpires })
    .eq('id', clinicId)

  // Turning it off releases the bookings already counting down. Turning it on
  // does not retroactively put a clock on the ones waiting: the first choice
  // can only preserve a booking, the second could make a dozen of them lapse
  // within half an hour of a setting nobody thought was dangerous.
  if (!autoExpires) {
    await admin
      .from('appointments')
      .update({ expires_at: null })
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente')
  }

  // The countdown is drawn on the agenda, not only on this screen.
  revalidatePath('/', 'layout')
}

/**
 * Which languages Telma answers this clinic's calls in.
 *
 * The clinic edits its own, up to the number its plan includes. The count is
 * checked here so the reader gets a sentence instead of a Postgres error, and
 * again by the trigger on `clinics`, which is where the rule actually lives:
 * this action is not the only thing that writes to that table.
 *
 * The base language cannot be removed and is not read from the form. A clinic
 * that stopped speaking the language of the country it is in would leave every
 * caller who dialled expecting it with nobody to talk to.
 */
export async function updateClinicLanguages(
  codes: string[]
): Promise<{ ok: boolean; error?: string }> {
  const clinicId = await ownClinicId()
  const admin = createAdminClient()

  const { data: clinic } = await admin
    .from('clinics')
    .select('plan, language, selected_languages')
    .eq('id', clinicId)
    .maybeSingle()
  if (!clinic) return { ok: false, error: 'clinic' }

  const base = (clinic.language as string) ?? 'pt'
  const before: string[] = clinic.selected_languages ?? []

  const { data: available } = await admin
    .from('available_languages')
    .select('code')
    .eq('status', 'available')
  const sellable = new Set(((available ?? []) as Array<{ code: string }>).map((r) => r.code))

  const next = [base, ...codes.filter((c) => c !== base && sellable.has(c))]

  const { data: plan } = await admin
    .from('plans')
    .select('max_languages_included')
    .eq('id', clinic.plan)
    .maybeSingle()
  const max = (plan?.max_languages_included ?? null) as number | null

  if (max !== null && next.length > max) {
    return { ok: false, error: 'too_many' }
  }

  const { error } = await admin
    .from('clinics')
    .update({ selected_languages: next })
    .eq('id', clinicId)
  if (error) return { ok: false, error: error.message }

  // What changed, in words, so the internal team reading Atividade can see a
  // clinic add a language without diffing two arrays.
  const added = next.filter((c) => !before.includes(c))
  const removed = before.filter((c) => !next.includes(c))
  if (added.length || removed.length) {
    await admin.from('activity_log').insert({
      clinic_id: clinicId,
      type: 'languages_changed',
      message: [
        added.length ? `Idiomas adicionados: ${added.join(', ')}` : null,
        removed.length ? `Idiomas removidos: ${removed.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  revalidatePath('/conta')
  return { ok: true }
}

/**
 * What the account screen needs to draw the language section.
 *
 * One call rather than three from the page: the list, what is chosen, which one
 * cannot be removed, and how many the plan allows are four halves of the same
 * question, and fetching them separately is how they end up disagreeing.
 */
export async function clinicLanguageSettings(clinicId: string): Promise<{
  languages: Array<{ code: string; name: string; status: 'available' | 'coming_soon' | 'deprecated' }>
  selected: string[]
  base: string
  max: number | null
}> {
  if (isDemo()) {
    return {
      languages: [
        { code: 'pt', name: 'Português', status: 'available' },
        { code: 'es', name: 'Español', status: 'available' },
        { code: 'ca', name: 'Català', status: 'available' },
        { code: 'en', name: 'English', status: 'available' },
        { code: 'fr', name: 'Français', status: 'coming_soon' },
      ],
      selected: ['pt'],
      base: 'pt',
      max: 3,
    }
  }

  const admin = createAdminClient()
  const [{ data: clinic }, { data: rows }] = await Promise.all([
    admin
      .from('clinics')
      .select('plan, language, selected_languages')
      .eq('id', clinicId)
      .maybeSingle(),
    admin
      .from('available_languages')
      .select('code, name, status')
      .neq('status', 'deprecated')
      .order('sort_order', { ascending: true }),
  ])

  const base = ((clinic?.language as string) ?? 'pt') as string
  const { data: plan } = await admin
    .from('plans')
    .select('max_languages_included')
    .eq('id', clinic?.plan ?? 'essencial')
    .maybeSingle()

  return {
    languages: (rows ?? []) as Array<{
      code: string
      name: string
      status: 'available' | 'coming_soon' | 'deprecated'
    }>,
    selected: (clinic?.selected_languages as string[]) ?? [base],
    base,
    max: (plan?.max_languages_included ?? null) as number | null,
  }
}
