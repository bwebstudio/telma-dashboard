'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isDemo } from '@/lib/demo/config'
import { writeClinicOverride } from '@/lib/demo/overrides'
import { CLINIC_ACCENTS, type ClinicAccent } from '@/lib/types'

// A clinic changes how its own panel looks, and nothing else. The
// administrator visiting the panel is read only here like everywhere else:
// this is the clinic's own face, not something to be set for them.
async function ownClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

const MAX_BYTES = 1024 * 1024
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export async function setAccent(formData: FormData): Promise<void> {
  const value = String(formData.get('accent') || '')
  if (!CLINIC_ACCENTS.includes(value as ClinicAccent)) return
  const clinicId = await ownClinicId()

  if (isDemo()) {
    writeClinicOverride(clinicId, { accent: value as ClinicAccent })
  } else {
    const supabase = await createClient()
    await supabase.from('clinics').update({ accent: value }).eq('id', clinicId)
  }
  // The accent lives on the shell, so every screen has to be re-rendered, not
  // only the one the form was submitted from.
  revalidatePath('/', 'layout')
}

export async function uploadLogo(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) return {}

  const ext = TYPES[file.type]
  if (!ext) return { error: 'type' }
  if (file.size > MAX_BYTES) return { error: 'size' }

  const clinicId = await ownClinicId()

  if (isDemo()) {
    // No storage to write to. A data URL keeps the preview honest for the rest
    // of the session, which is all demo mode ever promises.
    const buf = Buffer.from(await file.arrayBuffer())
    writeClinicOverride(clinicId, {
      logo_url: `data:${file.type};base64,${buf.toString('base64')}`,
    })
    revalidatePath('/', 'layout')
    return {}
  }

  const supabase = await createClient()
  // One name per clinic, overwritten on each upload: no orphaned files piling
  // up in the bucket, and the folder is the clinic id, which is what the
  // storage policy checks.
  const path = `${clinicId}/logo.${ext}`
  const { error } = await supabase.storage
    .from('clinic-logos')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return { error: 'upload' }

  const { data } = supabase.storage.from('clinic-logos').getPublicUrl(path)
  // The cache buster is the point: the path never changes, so without it the
  // browser would keep showing the logo the clinic just replaced.
  const url = `${data.publicUrl}?v=${Date.now()}`

  await supabase.from('clinics').update({ logo_url: url }).eq('id', clinicId)
  revalidatePath('/', 'layout')
  return {}
}

export async function removeLogo(): Promise<void> {
  const clinicId = await ownClinicId()

  if (isDemo()) {
    writeClinicOverride(clinicId, { logo_url: null })
  } else {
    const supabase = await createClient()
    await supabase.from('clinics').update({ logo_url: null }).eq('id', clinicId)
    await supabase.storage
      .from('clinic-logos')
      .remove(['png', 'jpg', 'webp', 'svg'].map((e) => `${clinicId}/logo.${e}`))
  }
  revalidatePath('/', 'layout')
}
