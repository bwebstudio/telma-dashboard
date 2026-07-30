'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAppUser, isCrmAdmin, isCrmUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isLocale } from '@/content'
import { normalisePhone } from '@/lib/crm/phone'
import type {
  CrmContactRole,
  CrmCountry,
  CrmOrigin,
  CrmRepRole,
  CrmSpecialty,
} from '@/lib/crm/types'

export type CrmState = { error?: string; ok?: boolean }

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const nullable = (fd: FormData, key: string) => str(fd, key) || null

// crm_activities.rep_id points at crm_reps, and an internal admin does not
// necessarily have a rep row. Signing an activity with their user id would
// break the foreign key, so it is left unsigned instead.
async function signAs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase.from('crm_reps').select('id').eq('id', userId).maybeSingle()
  return data ? userId : null
}

// New prospect ---------------------------------------------------------------
// Only the name is required. A rep keeps what they create; an admin may leave
// it unassigned or hand it straight to somebody.
export async function createProspect(
  _prev: CrmState,
  formData: FormData
): Promise<CrmState> {
  const me = await getAppUser()
  if (!isCrmUser(me) || !me) return { error: 'forbidden' }

  const name = str(formData, 'name')
  if (!name) return { error: 'invalid' }

  const supabase = await createClient()
  const admin = isCrmAdmin(me)

  // A rep can only file prospects under their own name (RLS enforces it too).
  const repField = str(formData, 'rep_id')
  const rep_id = admin ? (repField === 'none' || !repField ? null : repField) : me.id

  // Stored with the country code, because a bare national number does not dial
  // from another country and the reps work across the border.
  const country = (str(formData, 'country') || 'PT') as CrmCountry

  const { data, error } = await supabase
    .from('crm_prospects')
    .insert({
      name,
      phone: normalisePhone(nullable(formData, 'phone'), country),
      zone: nullable(formData, 'zone'),
      address: nullable(formData, 'address'),
      website: nullable(formData, 'website'),
      specialty: (str(formData, 'specialty') || 'other') as CrmSpecialty,
      country,
      origin: (str(formData, 'origin') || 'cold') as CrmOrigin,
      origin_note: nullable(formData, 'origin_note'),
      rep_id,
      created_by: me.id,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message ?? 'insert' }
  const prospectId = data.id as string

  const contactName = str(formData, 'contact_name')
  if (contactName) {
    await supabase.from('crm_contacts').insert({
      prospect_id: prospectId,
      name: contactName,
      role: (str(formData, 'contact_role') || 'other') as CrmContactRole,
      phone: normalisePhone(nullable(formData, 'contact_phone'), country),
      notes: nullable(formData, 'contact_notes'),
    })
  }

  // Whatever the paste parser could not place is kept as the first note, so
  // no part of the original message is thrown away.
  const leftovers = str(formData, 'rest')
  if (leftovers) {
    await supabase.from('crm_activities').insert({
      prospect_id: prospectId,
      rep_id: await signAs(supabase, me.id),
      type: 'note',
      result: null,
      note: leftovers,
    })
  }

  revalidatePath('/crm/prospetos')
  redirect(`/crm/prospetos/${prospectId}`)
}

// Take an unassigned prospect ------------------------------------------------
export async function takeProspect(formData: FormData): Promise<void> {
  const me = await getAppUser()
  if (!isCrmUser(me) || !me) return

  const id = str(formData, 'prospect_id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('crm_prospects').update({ rep_id: me.id }).eq('id', id)

  revalidatePath('/crm/hoje')
  revalidatePath('/crm/prospetos')
  revalidatePath(`/crm/prospetos/${id}`)
}

// Reassign (admin) -----------------------------------------------------------
export async function assignProspect(formData: FormData): Promise<void> {
  const me = await getAppUser()
  if (!isCrmAdmin(me)) return

  const id = str(formData, 'prospect_id')
  const repField = str(formData, 'rep_id')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('crm_prospects')
    .update({ rep_id: repField === 'none' || !repField ? null : repField })
    .eq('id', id)

  revalidatePath('/crm/prospetos')
  revalidatePath(`/crm/prospetos/${id}`)
}

// Contacts -------------------------------------------------------------------
export async function addContact(formData: FormData): Promise<void> {
  const me = await getAppUser()
  if (!isCrmUser(me)) return

  const prospectId = str(formData, 'prospect_id')
  const name = str(formData, 'name')
  if (!prospectId || !name) return

  const supabase = await createClient()

  // The contact's number belongs to the clinic's country, not the rep's.
  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('country')
    .eq('id', prospectId)
    .maybeSingle()

  await supabase.from('crm_contacts').insert({
    prospect_id: prospectId,
    name,
    role: (str(formData, 'role') || 'other') as CrmContactRole,
    phone: normalisePhone(nullable(formData, 'phone'), (prospect?.country ?? 'PT') as CrmCountry),
    notes: nullable(formData, 'notes'),
  })

  revalidatePath(`/crm/prospetos/${prospectId}`)
}

// Conversion to a real client ------------------------------------------------
// A rep cannot create a client: the alta needs a plan, opening hours and a
// Twilio number they do not have. They raise the request, the internal team
// finishes it on the existing "nova clínica" form.
export async function requestConversion(formData: FormData): Promise<void> {
  const me = await getAppUser()
  if (!isCrmUser(me) || !me) return

  const id = str(formData, 'prospect_id')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('crm_prospects')
    .update({ conversion_requested_at: new Date().toISOString() })
    .eq('id', id)

  await supabase.from('crm_activities').insert({
    prospect_id: id,
    rep_id: await signAs(supabase, me.id),
    type: 'note',
    result: null,
    note: str(formData, 'note') || null,
  })

  revalidatePath(`/crm/prospetos/${id}`)
}

// Sales team management (admin) ---------------------------------------------
// Creates the Supabase Auth account, the app user with the new 'comercial'
// role, and the rep row. Same login as the rest of the panel, no second
// authentication system.
export async function createRep(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const me = await getAppUser()
  if (!isCrmAdmin(me)) return { error: 'forbidden' }

  const fullName = str(formData, 'full_name')
  const email = str(formData, 'email')
  const password = String(formData.get('password') ?? '')
  const repRole = (str(formData, 'rep_role') || 'comercial') as CrmRepRole
  const localeField = str(formData, 'locale')
  const locale = isLocale(localeField) ? localeField : 'pt'

  if (!fullName || !email || password.length < 8) return { error: 'invalid' }

  const admin = createAdminClient()
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !created?.user) return { error: authErr?.message ?? 'auth' }

  const userId = created.user.id as string

  const { error: userErr } = await admin.from('users').insert({
    id: userId,
    email,
    full_name: fullName,
    role: repRole === 'admin' ? 'interno' : 'comercial',
    clinic_id: null,
    locale,
  })
  if (userErr) return { error: userErr.message }

  const { error: repErr } = await admin.from('crm_reps').insert({
    id: userId,
    full_name: fullName,
    email,
    country: (str(formData, 'country') || 'PT') as CrmCountry,
    territory: nullable(formData, 'territory'),
    role: repRole,
    active: true,
  })
  if (repErr) return { error: repErr.message }

  revalidatePath('/crm/equipa')
  return { ok: true }
}

export async function setRepActive(formData: FormData): Promise<void> {
  const me = await getAppUser()
  if (!isCrmAdmin(me)) return

  const id = str(formData, 'rep_id')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('crm_reps')
    .update({ active: formData.get('active') === '1' })
    .eq('id', id)

  revalidatePath('/crm/equipa')
}
