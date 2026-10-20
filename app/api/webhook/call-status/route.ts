import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The call that ended before anybody said a word.
 *
 * ── WHY THIS ENDPOINT EXISTS ───────────────────────────────────────────────
 * Everything else in the panel is written by the voice platform when a
 * conversation finishes. Somebody who rings the clinic and hangs up while it
 * is still ringing never has a conversation, so until now that call existed
 * nowhere: not in the list, not in the counters, not on the record of the
 * person who rang.
 *
 * It is the call a clinic most wants to see. "You are not losing calls any
 * more" is the whole promise, and it cannot be checked against a list that
 * only holds the calls that went well.
 *
 * ── WHO CALLS IT ───────────────────────────────────────────────────────────
 * Twilio, once per call, when the call ends -- whatever became of it. The
 * address carries a secret in the query string because Twilio cannot send a
 * header, and because the only thing this can be made to do is file a missed
 * call against a call id the network itself issued minutes ago.
 *
 * ── HOW IT KNOWS NOBODY ANSWERED ───────────────────────────────────────────
 * Not from Twilio, which only knows that the call ended: as far as it is
 * concerned a conversation with Telma and a caller who hung up are both
 * `completed`. The two moments that decide it are written down as they
 * happen, by the two places that know:
 *
 *   /api/voice/incoming  marks `rejected_at` when it answers with the engaged
 *                        tone, which is a clinic that left us or asked to
 *                        pause. Nobody was meant to answer, so nothing is
 *                        missed.
 *   /api/voice/init      marks `answered_at` when the platform asks who to
 *                        be, which is the moment a conversation starts. From
 *                        there the post-call webhook writes the real row.
 *
 * Neither mark, and the call ended: that is a call nobody answered.
 *
 * ── WHAT IT WRITES ─────────────────────────────────────────────────────────
 * A call of zero seconds with `nao_atendida`, through the same function every
 * other call goes through, keyed on the Twilio call id so that a retried
 * delivery files one row and not four. Zero seconds costs the clinic no
 * minutes, which is right: nobody was served.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The states in which a call is over. Twilio sends the ringing ones too when
 *  a number is configured for every event; those are not an outcome. */
const ENDED = new Set(['completed', 'no-answer', 'busy', 'failed', 'canceled'])

function authorized(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  const given = new URL(request.url).searchParams.get('t')
  // Constant time is not the point here -- the token is in a URL we set
  // ourselves on our own numbers -- but a plain mismatch should not leak the
  // length either, and this is one line.
  return typeof given === 'string' && given.length === token.length && given === token
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let fields: Record<string, string> = {}
  try {
    const form = await request.formData()
    for (const [k, v] of form.entries()) fields[k] = String(v)
  } catch {
    fields = Object.fromEntries(new URL(request.url).searchParams.entries())
  }

  const callSid = (fields.CallSid ?? '').trim()
  const status = (fields.CallStatus ?? '').trim()
  const from = (fields.From ?? '').trim()
  const dialled = (fields.To ?? '').trim()

  if (!callSid || !ENDED.has(status)) {
    return NextResponse.json({ ok: true, skipped: 'not_an_ending' })
  }

  const admin = createAdminClient()

  // The note the first hop left, which is also where the two marks live.
  const { data } = await admin
    .from('call_routes')
    .select('clinic_id, answered_at, rejected_at')
    .eq('call_sid', callSid)
    .maybeSingle()
  const route = data as
    | { clinic_id: string; answered_at: string | null; rejected_at: string | null }
    | null

  if (route?.answered_at) {
    return NextResponse.json({ ok: true, skipped: 'answered' })
  }
  if (route?.rejected_at) {
    return NextResponse.json({ ok: true, skipped: 'refused' })
  }

  // No note means nobody forwarded: a call dialled straight at a Telma line,
  // which the dialled number answers for. Same rule as the live call, so a
  // missed call is filed where the conversation would have been.
  let clinicId = route?.clinic_id ?? null
  if (!clinicId && dialled.replace(/\D/g, '').length >= 8) {
    const { data: byNumber } = await admin.rpc('clinic_by_dialled_number', {
      p_number: dialled,
    })
    clinicId = (byNumber as string | null) ?? null
  }

  // Nobody owns the number and nobody forwarded it. Filing it against a guess
  // would put one clinic's missed call in another clinic's list.
  if (!clinicId) {
    return NextResponse.json({ ok: true, skipped: 'no_clinic' })
  }

  const { error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: from || null,
    p_duration: 0,
    p_result: 'nao_atendida',
    p_summary: null,
    p_recording_url: null,
    // Prefixed, because the other reference on this table is a conversation
    // id from the voice platform and the two must not be able to collide.
    p_external_ref: `twilio:${callSid}`,
    p_appointment: null,
  })

  if (error) {
    console.error('[call-status]', error.message)
    return NextResponse.json({ error: 'not_recorded' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, recorded: true })
}

/** Twilio can be configured with GET, and a retry may arrive either way. */
export async function GET(request: Request) {
  return POST(request)
}
