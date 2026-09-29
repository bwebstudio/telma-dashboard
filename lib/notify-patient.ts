import { createAdminClient } from '@/lib/supabase/admin'
import { activeAddons } from '@/lib/clinic-utils'
import type { Clinic } from '@/lib/types'
import { messageFor, type NotifyKind } from '@/lib/notify-copy'
// The sender, the fallback to the clinic's name and the WhatsApp template rule
// all live in one place now, because the reminders in lib/recalls.ts need the
// same three and the alternative was a second copy of them.
import { sendToPatient } from '@/lib/sms'

export type { NotifyKind }

/**
 * Telling the patient what the clinic decided.
 *
 * Telma ends every booking by saying it is subject to the clinic confirming
 * it, and until now that confirmation never travelled: somebody pressed a
 * button in the panel and the patient found out by turning up, or by not
 * turning up. This is the other half of a sentence we were already saying.
 *
 * ── WHEN, AND ONLY WHEN ────────────────────────────────────────────────────
 * On what the clinic does, never on what Telma does. A message the moment a
 * call ends would say "we have your request", which the patient already knows
 * because they just asked for it out loud, and it would go out for bookings
 * the clinic then rejects. Three moments: confirmed, moved, refused.
 *
 * ── WHICH CHANNEL ──────────────────────────────────────────────────────────
 * SMS for everybody, WhatsApp only where the clinic pays for that add-on AND
 * there is an approved template to send. `activeAddons` knows the first half.
 *
 * The second half is Meta's rule and it is not optional: a message the business
 * starts, outside the twenty-four hours after the patient last wrote, has to be
 * a template approved in advance. A confirmation goes out days after the call,
 * so it is always outside that window and always needs one. Free text there is
 * not "worse", it is refused.
 *
 * This shipped without that and would have failed on the one clinic that has
 * the add-on. Until the templates exist, WhatsApp falls back to SMS, which
 * arrives, and the row says which one carried it.
 *
 * ── WHAT A FAILURE MUST NOT DO ─────────────────────────────────────────────
 * Stop the confirmation. The clinic's decision is the thing that matters and
 * it is already written when this runs; a dead Twilio account, a landline, a
 * number typed wrong must not throw that away. Every failure is caught, and
 * written to the row so the panel can say the patient never heard.
 */

export async function notifyPatient(appointmentId: string, kind: NotifyKind): Promise<void> {
  const admin = createAdminClient()
  try {
    const { data } = await admin
      .from('appointments')
      .select('id, clinic_id, patient_phone, scheduled_at, reject_reason, notified_at, notified_kind')
      .eq('id', appointmentId)
      .maybeSingle()
    const appt = data as {
      clinic_id: string
      patient_phone: string
      scheduled_at: string
      reject_reason: string | null
      notified_at: string | null
      notified_kind: string | null
    } | null
    if (!appt) return

    // Confirming twice is one decision pressed twice. Moving the hour and then
    // confirming is two things the patient needs to know about, and the kind is
    // what tells them apart.
    if (appt.notified_at && appt.notified_kind === kind) return

    const { data: clinicRow } = await admin
      .from('clinics')
      .select('*')
      .eq('id', appt.clinic_id)
      .maybeSingle()
    const clinic = clinicRow as Clinic | null
    if (!clinic) return

    // One content sid per kind, because the three say different things and
    // Meta approves each on its own. Set them and WhatsApp starts carrying the
    // clinics that pay for it; leave them unset and everybody gets an SMS.
    const template = process.env[`TWILIO_WHATSAPP_TEMPLATE_${kind.toUpperCase()}`]?.trim()
    const wantsWhatsapp = activeAddons(clinic).includes('whatsapp')
    const channel = wantsWhatsapp && template ? 'whatsapp' : 'sms'

    const res = await sendToPatient({
      clinic,
      to: appt.patient_phone,
      channel,
      template,
      // The clinic's number goes into the text only when the sender is a name,
      // because then there is nothing to reply to. lib/sms.ts decides which.
      text: (withPhone) =>
        messageFor(kind, clinic, appt.scheduled_at, appt.reject_reason, withPhone),
    })

    await record(admin, appointmentId, kind, channel, res.error)
  } catch (e) {
    // Including a database that is down. The decision stands either way.
    await record(admin, appointmentId, kind, null, e instanceof Error ? e.message : 'erro').catch(
      () => {}
    )
  }
}

async function record(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  kind: NotifyKind,
  channel: string | null,
  error: string | null
) {
  await admin
    .from('appointments')
    .update({
      notified_at: new Date().toISOString(),
      notified_kind: kind,
      notified_channel: channel,
      notify_error: error,
    })
    .eq('id', id)
}
