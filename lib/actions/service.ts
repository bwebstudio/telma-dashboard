'use server'

import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import { writeClinicOverride } from '@/lib/demo/overrides'
import { store } from '@/lib/demo/data'
import { ERASURE_GRACE_DAYS, PAUSE_MONTHS } from '@/lib/service-limits'
import { FORWARD_UNDO } from '@/lib/forwarding'
import { sendServiceEndingEmail } from '@/lib/onboarding/email-sender'
import type { OnboardingLocale } from '@/lib/onboarding/locale'
import {
  cancelAtPeriodEnd,
  keepSubscription,
  pauseCollection,
  resumeCollection,
  subscriptionPeriodEnd,
} from '@/lib/onboarding/stripe-client'

/**
 * Stopping, and being forgotten.
 *
 * ── WHY ANY OF THIS IS IN THE PANEL ────────────────────────────────────────
 * A clinic that wants to stop had to write to us, and one that wanted its
 * data gone had no answer at all. The second is a right it has, not a favour
 * we do, and the first is the thing every guide on the subject says to make
 * easy: resistance at the door is paid for later, by a clinic that will not
 * come back and will tell other clinics why.
 *
 * ── THE THREE DOORS, AND WHY THEY ARE THREE ────────────────────────────────
 * Pausing keeps everything and stops the money. Leaving keeps the data until
 * the end of what was paid for. Being forgotten destroys it, a month later.
 * Collapsing them would mean somebody pressing "cancel" in August and losing
 * a year of their patients' history.
 *
 * ── AND THE THING THE TELEPHONE NETWORK DOES NOT KNOW ──────────────────────
 * None of this undoes the forward on the clinic's line. Only the clinic can,
 * by dialling ##002# from its own telephone, and until it does, its patients
 * keep ringing a line that no longer answers for it. Every one of these
 * actions is paired with that reminder on screen, because it is the only part
 * of leaving that we cannot do for them.
 */

async function ownClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

/** Only the clinic may do these. An administrator visiting is a visitor:
 *  deciding that a clinic is leaving is nobody's decision but theirs. */
async function clinicRow(): Promise<{
  id: string
  status: string
  stripe_subscription_id: string | null
}> {
  const id = await ownClinicId()
  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('id, status, stripe_subscription_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) throw new Error('not_found')
  return data as { id: string; status: string; stripe_subscription_id: string | null }
}

export type ServiceResult = { ok: true } | { ok: false; error: string }

/**
 * Away until a date, then back.
 *
 * Telma stops answering: a clinic that is not being charged is not being
 * answered for, and the screen says so plainly before the button is pressed.
 * Everything else -- the number, the timetable, the patients, the price
 * agreed -- is exactly where it was left.
 */
export async function pauseService(formData: FormData): Promise<ServiceResult> {
  const months = Number(formData.get('months'))
  if (!(PAUSE_MONTHS as readonly number[]).includes(months)) return { ok: false, error: 'months' }

  const until = new Date()
  until.setMonth(until.getMonth() + months)
  const untilDay = until.toISOString().slice(0, 10)

  if (isDemo()) {
    const demoId = await ownClinicId()
    writeClinicOverride(demoId, { status: 'pausada', service_paused_until: untilDay })
    // The store as well as the override bag: the demo's own agenda reads the
    // clinic row, and a demo that shows the pause on one screen and not on
    // the next is demonstrating nothing.
    const demo = store.clinics.find((c) => c.id === demoId)
    if (demo) demo.status = 'pausada'
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  // Not from anywhere else. A clinic awaiting its first payment or already
  // leaving is in the middle of something, and a pause on top of it would be
  // two states at once.
  if (clinic.status !== 'ativa') return { ok: false, error: 'status' }

  try {
    if (clinic.stripe_subscription_id) await pauseCollection(clinic.stripe_subscription_id)
  } catch (e) {
    console.error('[service] pause', e)
    return { ok: false, error: 'stripe' }
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ status: 'pausada', service_paused_until: untilDay })
    .eq('id', clinic.id)
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'service_paused',
    message: `Serviço em pausa até ${untilDay}, a pedido da clínica.`,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Back early, or back on the day. The sweep calls the same path. */
export async function resumeService(): Promise<ServiceResult> {
  if (isDemo()) {
    const demoId = await ownClinicId()
    writeClinicOverride(demoId, { status: 'ativa', service_paused_until: null })
    const demo = store.clinics.find((c) => c.id === demoId)
    if (demo) demo.status = 'ativa'
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  try {
    if (clinic.stripe_subscription_id) await resumeCollection(clinic.stripe_subscription_id)
  } catch (e) {
    console.error('[service] resume', e)
    return { ok: false, error: 'stripe' }
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ status: 'ativa', service_paused_until: null })
    .eq('id', clinic.id)
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'service_resumed',
    message: 'Serviço retomado.',
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Leaving, at the end of what was paid for.
 *
 * The reason is optional and goes nowhere near the clinic again: it is for us,
 * to find out what we are doing wrong, and a required one is a question people
 * answer with whatever closes the dialog.
 */
export async function cancelService(formData: FormData): Promise<ServiceResult> {
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 1000) || null

  if (isDemo()) {
    const when = new Date()
    when.setMonth(when.getMonth() + 1)
    writeClinicOverride(await ownClinicId(), {
      cancel_requested_at: new Date().toISOString(),
      cancel_effective_at: when.toISOString(),
      cancel_reason: reason,
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  if (clinic.status === 'cancelada') return { ok: false, error: 'status' }

  let effective: string | null = null
  try {
    if (clinic.stripe_subscription_id) {
      effective =
        (await cancelAtPeriodEnd(clinic.stripe_subscription_id)) ??
        (await subscriptionPeriodEnd(clinic.stripe_subscription_id))
    }
  } catch (e) {
    console.error('[service] cancel', e)
    return { ok: false, error: 'stripe' }
  }

  // No subscription to end -- a clinic that never paid, or one on a plan we
  // invoice by hand. The request still stands and the date is the one thing
  // that has to exist, so the panel can say when the telephone stops.
  if (!effective) {
    const fallback = new Date()
    fallback.setMonth(fallback.getMonth() + 1)
    effective = fallback.toISOString()
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({
      cancel_requested_at: new Date().toISOString(),
      cancel_effective_at: effective,
      cancel_reason: reason,
    })
    .eq('id', clinic.id)

  // ── THE CODE, SOMEWHERE THEY WILL STILL HAVE IT ────────────────────────
  // The panel says it too, but the panel is a place they have just decided to
  // stop visiting. On the day the telephone goes quiet, this is what they
  // still have. Never fatal: a cancellation that failed to send an email is
  // still a cancellation, and refusing it would trap the clinic here.
  try {
    const { data: full } = await admin
      .from('clinics')
      .select('name, contact_email, language')
      .eq('id', clinic.id)
      .maybeSingle()
    const row = full as { name?: string; contact_email?: string; language?: string } | null
    if (row?.contact_email) {
      const locale: OnboardingLocale = row.language === 'es' ? 'es' : 'pt'
      await sendServiceEndingEmail({
        email: row.contact_email,
        clinicName: row.name ?? '',
        locale,
        endsOn: new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'pt-PT', {
          dateStyle: 'long',
        }).format(new Date(effective)),
        undoCode: FORWARD_UNDO,
      })
    }
  } catch (e) {
    console.error('[service] ending email', e)
  }
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'service_cancelled',
    message: `Cancelamento pedido. Termina a ${effective.slice(0, 10)}.${
      reason ? ` Motivo: ${reason}` : ''
    }`,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Changed their mind, before the day arrived. */
export async function keepService(): Promise<ServiceResult> {
  if (isDemo()) {
    writeClinicOverride(await ownClinicId(), {
      cancel_requested_at: null,
      cancel_effective_at: null,
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  try {
    if (clinic.stripe_subscription_id) await keepSubscription(clinic.stripe_subscription_id)
  } catch (e) {
    console.error('[service] keep', e)
    return { ok: false, error: 'stripe' }
  }

  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ cancel_requested_at: null, cancel_effective_at: null })
    .eq('id', clinic.id)
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Asking to be forgotten.
 *
 * Only the clock starts here. Everything that is destroyed is destroyed by
 * the sweep thirty days later, in one place, where it can be read and
 * reasoned about -- and where it is one code path rather than one per button.
 */
export async function requestErasure(): Promise<ServiceResult> {
  if (isDemo()) {
    writeClinicOverride(await ownClinicId(), { deletion_requested_at: new Date().toISOString() })
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  const admin = createAdminClient()
  await admin
    .from('clinics')
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('id', clinic.id)
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'erasure_requested',
    message: `Pedido de eliminação de dados. Executa-se em ${ERASURE_GRACE_DAYS} dias.`,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Stopping the clock. The same state as never having asked. */
export async function cancelErasure(): Promise<ServiceResult> {
  if (isDemo()) {
    writeClinicOverride(await ownClinicId(), { deletion_requested_at: null })
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const clinic = await clinicRow()
  const admin = createAdminClient()
  await admin.from('clinics').update({ deletion_requested_at: null }).eq('id', clinic.id)
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'erasure_cancelled',
    message: 'Pedido de eliminação de dados anulado.',
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
