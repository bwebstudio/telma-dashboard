'use server'

import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_MINUTES } from '@/lib/plans'
import type { PlanType } from '@/lib/types'

export type CreateState = { error?: string }

const PLANS: PlanType[] = ['essencial', 'clinica', 'rede', 'personalizado']
const WEEKDAYS = [1, 2, 3, 4, 5] // Monday to Friday
const HOURS = [9, 10, 11, 12, 14, 15, 16, 17]
const pad = (n: number) => String(n).padStart(2, '0')

// Creates the clinic, its first clinic user and a default weekly schedule.
// Uses the service role, so it is guarded to internal users only.
export async function createClinic(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const me = await getAppUser()
  if (me?.role !== 'interno') return { error: 'forbidden' }

  const plan = (String(formData.get('plan') || 'essencial')) as PlanType
  const name = String(formData.get('name') || '').trim()
  const userEmail = String(formData.get('user_email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!name || !userEmail || password.length < 8) return { error: 'invalid' }

  const admin = createAdminClient()
  let clinicId: string | null = null

  try {
    const { data: clinic, error: clinicErr } = await admin
      .from('clinics')
      .insert({
        name,
        address: String(formData.get('address') || '') || null,
        phone: String(formData.get('phone') || '') || null,
        contact_email: String(formData.get('contact_email') || '') || null,
        plan,
        addon_whatsapp: formData.get('addon') === 'on',
        minute_limit: PLAN_MINUTES[plan] ?? 250,
      })
      .select('id')
      .single()
    if (clinicErr || !clinic) return { error: clinicErr?.message || 'clinic' }
    clinicId = clinic.id

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
    })
    if (authErr || !created.user) {
      await admin.from('clinics').delete().eq('id', clinicId)
      return { error: authErr?.message || 'auth' }
    }

    const { error: userErr } = await admin.from('users').insert({
      id: created.user.id,
      email: userEmail,
      full_name: String(formData.get('user_name') || '') || null,
      role: 'clinica',
      clinic_id: clinicId,
    })
    if (userErr) return { error: userErr.message }

    const slots = WEEKDAYS.flatMap((weekday) =>
      HOURS.map((h) => ({
        clinic_id: clinicId,
        weekday,
        start_time: `${pad(h)}:00:00`,
        end_time: `${pad(h + 1)}:00:00`,
        capacity: 1,
        active: true,
      }))
    )
    await admin.from('availability_slots').insert(slots)
    await admin.from('activity_log').insert({
      clinic_id: clinicId,
      type: 'clinic_created',
      message: `Clinica ${name} criada`,
    })

    // Came from the CRM: close the loop so the prospect points at the client
    // it became. The two records stay separate, they are only linked.
    const prospectId = String(formData.get('prospect_id') || '')
    if (prospectId) {
      await admin
        .from('crm_prospects')
        .update({
          converted_clinic_id: clinicId,
          converted_at: new Date().toISOString(),
          stage: 'won',
          next_action_at: null,
          next_action_text: null,
        })
        .eq('id', prospectId)
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'unknown' }
  }

  redirect(`/clinicas/${clinicId}`)
}

export { PLANS }
