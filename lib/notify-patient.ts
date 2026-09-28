import { createAdminClient } from '@/lib/supabase/admin'
import { activeAddons } from '@/lib/clinic-utils'
import type { Clinic } from '@/lib/types'
import { messageFor, senderIdFor, type NotifyKind } from '@/lib/notify-copy'

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

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim()
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim()

/** The number the message comes from: the clinic's own line, so a patient who
 *  replies or rings back reaches the clinic and not us. */
function senderFor(clinic: Clinic): string | null {
  return clinic.assigned_phone?.trim() || null
}

/**
 * Sends it, and records what happened either way.
 *
 * Never throws. The caller is a server action that has already written the
 * clinic's decision, and there is no version of "the SMS failed" that should
 * undo that.
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

    const from = senderFor(clinic)
    const to = appt.patient_phone?.trim()
    // One content sid per kind, because the three say different things and
    // Meta approves each on its own. Set them and WhatsApp starts carrying the
    // clinics that pay for it; leave them unset and everybody gets an SMS.
    const template = process.env[`TWILIO_WHATSAPP_TEMPLATE_${kind.toUpperCase()}`]?.trim()
    const wantsWhatsapp = activeAddons(clinic).includes('whatsapp')
    const channel = wantsWhatsapp && template ? 'whatsapp' : 'sms'

    if (!ACCOUNT_SID || !AUTH_TOKEN || !from || !to) {
      await record(admin, appointmentId, kind, channel, 'por_configurar')
      return
    }

    const send = async (sender: string, withPhone: boolean) => {
      const said = messageFor(kind, clinic, appt.scheduled_at, appt.reject_reason, withPhone)
      const body = new URLSearchParams(
        channel === 'whatsapp'
          ? {
              To: `whatsapp:${to}`,
              From: `whatsapp:${sender}`,
              // The approved template, with the one sentence as its single
              // variable. Meta approves the shape, not the words inside it.
              ContentSid: template as string,
              ContentVariables: JSON.stringify({ '1': said }),
            }
          : { To: to, From: sender, Body: said }
      )
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          cache: 'no-store',
        }
      )
      return { ok: r.ok, status: r.status, payload: (await r.json().catch(() => ({}))) as { message?: string } }
    }

    // The clinic's own number first, so a patient can ring back from the
    // message they are holding.
    let res = await send(from, false)

    // ── AND THE CLINIC'S NAME WHEN THAT NUMBER CANNOT CARRY AN SMS ──────────
    // Portuguese voice numbers mostly cannot, and there is no way to know
    // which without asking: Twilio answered "'From' number +351300602615 is
    // not SMS-capable" on the first real attempt. An alphanumeric sender works
    // there and Portugal takes one without registering it first.
    //
    // Retried here rather than configured per clinic, because a clinic cannot
    // be asked whether its number is SMS-capable and neither can we, before
    // trying. The cost of being wrong is one refused request.
    //
    // It is one-way, so nothing can be replied to, and that is why the message
    // carries the clinic's number in its text when it goes this way.
    const notSmsCapable = /not SMS-capable|is not a valid.*SMS/i.test(res.payload.message ?? '')
    if (!res.ok && notSmsCapable && channel === 'sms') {
      res = await send(senderIdFor(clinic.name), true)
    }
    const payload = res.payload
    // Twilio's own words, not a status code: "unverified number", "not a mobile
    // number", "out of funds" are all things a clinic can act on and "failed"
    // is not.
    await record(
      admin,
      appointmentId,
      kind,
      channel,
      res.ok ? null : payload.message || `HTTP ${res.status}`
    )
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
