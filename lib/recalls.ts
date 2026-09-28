import { createAdminClient } from '@/lib/supabase/admin'
import { activeAddons } from '@/lib/clinic-utils'
import type { Clinic } from '@/lib/types'
import { recallMessage, type RecallKind } from '@/lib/recall-copy'
import { sendToPatient } from '@/lib/sms'

/**
 * Sending the reminders that came due.
 *
 * Read once a day by app/api/cron/recalls. Everything about when a reminder is
 * created lives in the database (migration 0047); everything about whether it
 * actually goes out lives here, because every one of these checks is a reason
 * not to send and the database cannot see most of them.
 *
 * ── THE THREE REASONS NOT TO SEND ───────────────────────────────────────────
 * The reminder was somebody's decision, months ago, and the world has moved:
 *
 *   the clinic is paused or has left       it is not their patient any more
 *   the patient asked us to stop           an aviso needs no yes, but it obeys a no
 *   nobody ever asked the patient          a campanha needs a yes, and null is no
 *
 * The last two are closed rather than skipped. A row left waiting would be
 * looked at again tomorrow, and the day after, for ever, which is a queue that
 * only grows and an opt-out that is checked a thousand times instead of once.
 *
 * ── THE CAP ─────────────────────────────────────────────────────────────────
 * Thirty a day per clinic, and it is not a rate limit for Twilio's sake. It is
 * the blast radius of a mistake. Every one of these is typed by a person, so
 * thirty is already far more than a day's work at the desk; a number well above
 * it, arriving at once, means something went wrong upstream and the cap is what
 * makes that a thing somebody notices instead of a thing patients receive.
 * Whatever is over stays waiting and goes tomorrow.
 */

const DAILY_CAP = 30

/** How many to look at in one run. Well above the cap times any plausible
 *  number of clinics, so the cap is what limits sending and this only limits
 *  the size of one query. */
const SCAN_LIMIT = 1000

export interface RecallReport {
  due: number
  sent: number
  failed: number
  /** Closed without sending, and why: an opt-out, a missing consent, a clinic
   *  that switched it off. Counted by reason so a run that sends nothing says
   *  which of the four it was. */
  skipped: Record<string, number>
  held: number
}

interface DueRow {
  id: string
  clinic_id: string
  patient_id: string
  kind: RecallKind
  body: string | null
  patients: {
    phone: string
    reminders_opt_out_at: string | null
    marketing_consent_at: string | null
  } | null
}

export async function sendDueRecalls(): Promise<RecallReport> {
  const admin = createAdminClient()
  const report: RecallReport = { due: 0, sent: 0, failed: 0, skipped: {}, held: 0 }
  const skip = (why: string) => {
    report.skipped[why] = (report.skipped[why] ?? 0) + 1
  }

  // Today in the clinic's own terms is not knowable in one query across
  // timezones, and it does not need to be: the job runs mid-morning in both
  // countries this serves, and a reminder is a date, not an hour.
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await admin
    .from('patient_recalls')
    .select(
      'id, clinic_id, patient_id, kind, body, patients!inner(phone, reminders_opt_out_at, marketing_consent_at)'
    )
    .eq('state', 'agendado')
    .lte('due_on', today)
    .order('due_on', { ascending: true })
    .limit(SCAN_LIMIT)

  if (error || !data?.length) return report
  const rows = data as unknown as DueRow[]
  report.due = rows.length

  // One read per clinic, not one per reminder.
  const clinics = new Map<string, Clinic>()
  const ids = [...new Set(rows.map((r) => r.clinic_id))]
  const { data: clinicRows } = await admin.from('clinics').select('*').in('id', ids)
  for (const c of (clinicRows ?? []) as Clinic[]) clinics.set(c.id, c)

  const sentToday = new Map<string, number>()

  for (const row of rows) {
    const clinic = clinics.get(row.clinic_id)
    const patient = row.patients

    if (!clinic || !patient) {
      await close(admin, row.id, 'sem_registo')
      skip('sem_registo')
      continue
    }

    // Paused, or gone. Left waiting rather than closed: a clinic that comes
    // back next month should find its diary intact, and the sixty day sweep in
    // purge_recalls() throws away whatever has gone stale.
    if (clinic.status !== 'ativa') {
      report.held++
      continue
    }

    if (row.kind === 'aviso' && patient.reminders_opt_out_at) {
      await close(admin, row.id, 'baixa')
      skip('baixa')
      continue
    }
    if (row.kind === 'campanha' && !patient.marketing_consent_at) {
      await close(admin, row.id, 'sem_consentimento')
      skip('sem_consentimento')
      continue
    }
    if (!patient.phone?.trim()) {
      await close(admin, row.id, 'sem_numero')
      skip('sem_numero')
      continue
    }

    const used = sentToday.get(clinic.id) ?? 0
    if (used >= DAILY_CAP) {
      report.held++
      continue
    }

    // WhatsApp only where the clinic pays for it and there is a template Meta
    // has approved. The same rule as the confirmations, and the same fallback:
    // an SMS that arrives beats a WhatsApp message that is refused.
    const template = process.env.TWILIO_WHATSAPP_TEMPLATE_AVISO?.trim()
    const channel = activeAddons(clinic).includes('whatsapp') && template ? 'whatsapp' : 'sms'

    const res = await sendToPatient({
      clinic,
      to: patient.phone,
      channel,
      template,
      // The number is in the text either way here, unlike a confirmation: a
      // reminder exists to get somebody to ring, and half of these are sent
      // from a name that cannot be replied to.
      text: () => recallMessage(clinic, row.kind, row.body),
    })

    sentToday.set(clinic.id, used + 1)
    await admin
      .from('patient_recalls')
      .update({
        state: res.ok ? 'enviado' : 'falhou',
        sent_at: new Date().toISOString(),
        channel: res.channel,
        error: res.error,
      })
      .eq('id', row.id)

    if (res.ok) report.sent++
    else report.failed++
  }

  return report
}

/** Closed, not sent, and the row says why. The clinic sees the reason. */
async function close(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  why: string
): Promise<void> {
  await admin
    .from('patient_recalls')
    .update({ state: 'cancelado', error: why, sent_at: new Date().toISOString() })
    .eq('id', id)
}
