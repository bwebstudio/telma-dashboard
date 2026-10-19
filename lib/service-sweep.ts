import { createAdminClient } from '@/lib/supabase/admin'
import { resumeCollection } from '@/lib/onboarding/stripe-client'
import { ERASURE_GRACE_DAYS } from '@/lib/service-limits'

/**
 * The things that happen to an account on a date rather than on a click.
 *
 * A pause ends. A cancellation falls due. An erasure asked for a month ago
 * comes round. None of them has anybody present when they happen, which is
 * exactly why they are here and not spread across the actions that scheduled
 * them: one place, read in one sitting, running once a day.
 */
export interface SweepReport {
  resumed: number
  stopped: number
  erased: number
  errors: string[]
}

export async function sweepServiceDates(now = new Date()): Promise<SweepReport> {
  const admin = createAdminClient()
  const report: SweepReport = { resumed: 0, stopped: 0, erased: 0, errors: [] }
  const today = now.toISOString().slice(0, 10)

  // ── BACK FROM THE PAUSE ────────────────────────────────────────────────
  try {
    const { data } = await admin
      .from('clinics')
      .select('id, stripe_subscription_id')
      .not('service_paused_until', 'is', null)
      .lte('service_paused_until', today)
    for (const row of (data ?? []) as Array<{ id: string; stripe_subscription_id: string | null }>) {
      try {
        if (row.stripe_subscription_id) await resumeCollection(row.stripe_subscription_id)
        await admin
          .from('clinics')
          .update({ status: 'ativa', service_paused_until: null })
          .eq('id', row.id)
          .eq('status', 'pausada')
        report.resumed += 1
      } catch (e) {
        report.errors.push(`resume ${row.id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  } catch (e) {
    report.errors.push(`resume: ${e instanceof Error ? e.message : e}`)
  }

  // ── THE DAY THE TELEPHONE STOPS ────────────────────────────────────────
  // Stripe sends `customer.subscription.deleted` when it ends the
  // subscription, and the webhook already writes 'cancelada'. This is the
  // backstop for a clinic with no subscription to end, and for a webhook that
  // never arrived. Same guard as the webhook: only from a live status.
  try {
    const { data } = await admin
      .from('clinics')
      .select('id')
      .not('cancel_effective_at', 'is', null)
      .lte('cancel_effective_at', now.toISOString())
      .neq('status', 'cancelada')
    for (const row of (data ?? []) as Array<{ id: string }>) {
      await admin.from('clinics').update({ status: 'cancelada' }).eq('id', row.id)
      await admin.from('activity_log').insert({
        clinic_id: row.id,
        type: 'service_ended',
        message: 'O serviço terminou na data pedida.',
      })
      report.stopped += 1
    }
  } catch (e) {
    report.errors.push(`stop: ${e instanceof Error ? e.message : e}`)
  }

  // ── AND BEING FORGOTTEN ────────────────────────────────────────────────
  // Thirty days after it was asked for, and only then. What goes is everything
  // that identifies anybody. What stays is `purchases`: six to ten years of
  // tax retention in both countries, and amounts with no name attached are no
  // longer personal data.
  //
  // The clinic row is not deleted either. It is emptied of everything that
  // names it, because the invoices point at it and a receipt that points at
  // nothing is not a record of anything.
  try {
    const cutoff = new Date(now.getTime() - ERASURE_GRACE_DAYS * 86400_000).toISOString()
    const { data } = await admin
      .from('clinics')
      .select('id')
      .not('deletion_requested_at', 'is', null)
      .lte('deletion_requested_at', cutoff)
    for (const row of (data ?? []) as Array<{ id: string }>) {
      try {
        await eraseClinic(row.id)
        report.erased += 1
      } catch (e) {
        report.errors.push(`erase ${row.id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  } catch (e) {
    report.errors.push(`erase: ${e instanceof Error ? e.message : e}`)
  }

  return report
}

/**
 * Everything about a clinic that names anybody, gone.
 *
 * Ordered so that a failure half way leaves less behind rather than more:
 * the patients first, because they are the people whose data this is and
 * whose right is being exercised.
 */
async function eraseClinic(clinicId: string): Promise<void> {
  const admin = createAdminClient()

  for (const table of [
    'appointments',
    'patient_recalls',
    'patients',
    'calls',
    'call_routes',
    'activity_log',
    'availability_slots',
    'blocked_days',
    'resources',
  ] as const) {
    const { error } = await admin.from(table).delete().eq('clinic_id', clinicId)
    // 'call_routes' is purged daily anyway and some of these may not exist on
    // an older project; a missing table must not strand the rest.
    if (error && !/does not exist/i.test(error.message)) throw new Error(`${table}: ${error.message}`)
  }

  // The accounts of the people who worked there.
  await admin.from('users').delete().eq('clinic_id', clinicId)

  // And the clinic itself, emptied rather than deleted: the invoices we are
  // obliged to keep point at this row.
  await admin
    .from('clinics')
    .update({
      name: 'Clínica eliminada',
      contact_email: null,
      phone: null,
      address: null,
      porting_details: null,
      briefing: null,
      price_info: null,
      emergency_number: null,
      fallback_number: null,
      after_hours_number: null,
      logo_url: null,
      cancel_reason: null,
      status: 'cancelada',
      deletion_requested_at: null,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', clinicId)
}
