import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Every call that ends, recorded, whether or not Telma remembered to.
 *
 * She has a tool for filing a call and it works when she reaches for it. On a
 * call where somebody swore at her four times she said "voy a dejarlo
 * registrado", never called the tool, and hung up. The clinic was billed for
 * five and a half minutes and has no record that the telephone rang: the rule
 * about filing lives inside the booking procedure, and that call never entered
 * it.
 *
 * ElevenLabs will post every finished conversation here on its own. That is the
 * difference between a call being recorded because the model chose to and being
 * recorded because it happened.
 *
 * Idempotent against the tool. Both are keyed on the conversation id, so
 * whichever arrives second corrects the first rather than duplicating it, and
 * the minutes are counted once.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PostCall {
  type?: string
  data?: {
    conversation_id?: string
    status?: string
    metadata?: { call_duration_secs?: number }
    analysis?: {
      transcript_summary?: string
      call_successful?: string
      /** What the analysis pass pulled out of the transcript. Configured by
       *  scripts/elevenlabs-evaluation.mjs; empty until it has been run. */
      data_collection_results?: Record<string, { value?: unknown }>
    }
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, string> }
  }
}

export async function POST(request: Request) {
  const raw = await request.text()

  // Signed with a shared secret rather than a bearer token: this endpoint is
  // called by ElevenLabs and not by us, so the check has to be something they
  // can produce and an attacker cannot.
  const secret = process.env.ELEVENLABS_POST_CALL_SECRET?.trim()
  if (!secret || !verify(request.headers.get('elevenlabs-signature'), raw, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: PostCall
  try {
    body = JSON.parse(raw) as PostCall
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const call = body.data
  const conversationId = call?.conversation_id
  const vars = call?.conversation_initiation_client_data?.dynamic_variables ?? {}
  const clinicId = vars.clinic_id

  // A call that could not be tied to a clinic is not ours to file. It happens
  // on the test console, where no number was dialled and the placeholder never
  // resolved, and filing it against a guess would put one clinic's call in
  // another clinic's panel.
  if (!conversationId || !clinicId || !isUuid(clinicId)) {
    return NextResponse.json({ ok: true, skipped: 'no_clinic' })
  }

  const admin = createAdminClient()
  const duration = Math.round(call?.metadata?.call_duration_secs ?? 0)
  const summary = call?.analysis?.transcript_summary ?? null

  // What was said out loud, gone and fetched afterwards.
  //
  // Telma files a call by calling telma_registar_chamada, and the name and the
  // number only ever exist inside that tool call. When she does not reach for
  // it -- she said "voy a dejarlo registrado" to a caller who had sworn at her
  // and never called it, and on another call somebody hung up between the "sim"
  // and the goodbye -- what lands here is a summary of a booking the clinic
  // cannot confirm and cannot ring back.
  //
  // The analysis pass runs on the finished transcript, so it does not depend on
  // the model having remembered anything. These four fields are its answer.
  const collected = call?.analysis?.data_collection_results ?? {}
  const field = (name: string): string | null => {
    const v = collected[name]?.value
    if (typeof v === 'string' && v.trim()) return v.trim()
    return null
  }
  const rescuedName = field('paciente_nome')
  const rescuedPhone = field('paciente_telefone')
  const rescuedBooking = field('marcacao_pedida')

  const { data: seen } = await admin
    .from('calls')
    .select('id, summary, duration_seconds')
    .eq('clinic_id', clinicId)
    .eq('external_ref', conversationId)
    .maybeSingle()
  const existing = seen as { id: string; summary: string | null; duration_seconds: number } | null

  if (existing) {
    // The platform's duration is the one that is true: the tool reports what
    // the model believed when it called it, which is always short of the end.
    await admin
      .from('calls')
      .update({ duration_seconds: duration, summary: existing.summary ?? summary })
      .eq('id', existing.id)
    return NextResponse.json({ ok: true, call_id: existing.id, corrected: true })
  }

  // Nothing filed it, so this is the only record there will be. `nao_resolvida`
  // is literally what happened: the call ended without a booking and without a
  // transfer, and a clinic seeing it can decide whether that matters.
  //
  // The rescued details go into the summary rather than into columns of their
  // own, because `calls` has neither: a name and a number live on an
  // appointment, and there is no appointment here -- that is the whole problem.
  // The summary is what the panel puts at the top of an opened call, so this is
  // where somebody reading it will find the number to ring.
  const rescued = [rescuedName, rescuedPhone, rescuedBooking].filter(Boolean).join(' · ')
  const fullSummary = rescued ? [rescued, summary].filter(Boolean).join('\n\n') : summary

  const { data, error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    // The number she was given to ring back on, when there is one. The caller
    // id is the number the call came in from, which the base spends a whole
    // rule explaining is not the same thing.
    p_from_phone: rescuedPhone ?? vars.system__caller_id ?? null,
    p_duration: duration,
    p_result: 'nao_resolvida',
    p_summary: fullSummary,
    p_recording_url: null,
    p_external_ref: conversationId,
    p_appointment: null,
  })
  if (error) return NextResponse.json({ error: 'could_not_record' }, { status: 500 })

  return NextResponse.json({ ok: true, ...(data as object) })
}

/** ElevenLabs signs as `t=<unix>,v0=<hex hmac of "t.body">`. */
function verify(header: string | null, body: string, secret: string): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const at = p.indexOf('=')
      return [p.slice(0, at).trim(), p.slice(at + 1).trim()]
    })
  )
  const timestamp = parts.t
  const given = parts.v0
  if (!timestamp || !given) return false

  // Half an hour either way. A signature that never expires is a signature
  // somebody can replay for ever out of a log.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 1800) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(given, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
