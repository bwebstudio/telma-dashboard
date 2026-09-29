import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Somebody replying "STOP" to a reminder.
 *
 * ── WHY THIS IS SMALL, AND WHY IT IS NOT AN INBOX ───────────────────────────
 * Nothing this system sends ever asks for a reply. The reminders say "ligue-nos"
 * and carry the clinic's number, deliberately: in Portugal they go out with the
 * clinic's name as the sender because Portuguese voice numbers mostly cannot
 * carry an SMS, and an alphanumeric sender is one-way. A message inviting a
 * reply that reaches nobody is worse than one that does not.
 *
 * So this exists for the one reply that has to work wherever it can arrive. A
 * clinic whose own number does carry SMS will get people typing STOP at it, and
 * a stop that lands nowhere is a stop we ignored.
 *
 * Anything else is answered with silence rather than stored. An inbox nobody
 * opens is a promise nobody keeps, and a patient writing "sim, quero marcar" to
 * a number where it would sit unread is exactly the harm this avoids by never
 * asking for a reply in the first place.
 *
 * ── SETTING IT UP ───────────────────────────────────────────────────────────
 * Twilio, the clinic's number, Messaging, "A message comes in" pointed at
 * https://<host>/api/webhook/sms. Nothing breaks if it is never configured; the
 * opt-out is also a switch on the patient's record, which is how a clinic that
 * is told on the telephone records it.
 */

export const dynamic = 'force-dynamic'

// Both languages, and the words people actually send. "NO" and "NAO" are in
// because somebody who wants it to stop types what comes to mind, not what the
// message told them to type.
const STOP = new Set([
  'stop', 'stopall', 'unsubscribe', 'end', 'quit', 'cancel',
  'baixa', 'baja', 'parar', 'para', 'sair', 'cancelar', 'nao', 'não', 'no',
])

/** Empty TwiML: received, nothing said back. A reply from us to a word we did
 *  not understand would be a conversation we cannot have. */
const SILENCE = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function digits(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(-9)
}

function flat(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

export async function POST(request: Request) {
  const xml = (status = 200) =>
    new NextResponse(SILENCE, { status, headers: { 'Content-Type': 'text/xml' } })

  try {
    const form = await request.formData()
    const from = String(form.get('From') ?? '')
    const to = String(form.get('To') ?? '')
    const said = flat(String(form.get('Body') ?? ''))
    if (!STOP.has(said) || !from || !to) return xml()

    const admin = createAdminClient()

    // Which clinic the message was sent to. Matched on the number rather than
    // trusted from anywhere else, and if two clinics somehow share a number
    // this stops rather than guessing which patient asked.
    const { data: clinics } = await admin
      .from('clinics')
      .select('id, name, assigned_phone')
      .not('assigned_phone', 'is', null)
    const mine = (clinics ?? []).filter(
      (c: { assigned_phone: string | null }) => digits(c.assigned_phone ?? '') === digits(to)
    )
    if (mine.length !== 1) return xml()
    const clinic = mine[0] as { id: string; name: string }

    const { data: updated } = await admin
      .from('patients')
      .update({ reminders_opt_out_at: new Date().toISOString() })
      .eq('clinic_id', clinic.id)
      .eq('phone_digits', digits(from))
      .select('id, name')

    // The clinic is told, because the person will ring one day and ask why they
    // heard nothing, and because somebody has to know the list got shorter.
    if (updated?.length) {
      await admin.from('activity_log').insert({
        clinic_id: clinic.id,
        type: 'aviso_baixa',
        message: `${updated[0].name} pediu para não receber avisos por mensagem.`,
      })
    }

    return xml()
  } catch {
    // Twilio retries a 500 and would retry it for ever on a message it can
    // never deliver. A stop that failed to record is recorded by whoever reads
    // it at the clinic.
    return xml()
  }
}
