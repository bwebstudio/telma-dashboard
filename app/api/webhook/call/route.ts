import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULTS = ['marcacao', 'transferida', 'informacao', 'nao_resolvida']

function authorized(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  const header = request.headers.get('authorization') || ''
  return header === `Bearer ${token}`
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clinicId = body.clinic_id as string | undefined
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id_required' }, { status: 400 })
  }
  // Checked here rather than left to Postgres. The agent's placeholder value is
  // deliberately not a UUID, so this is the path taken whenever a call starts
  // without the clinic being resolved, and letting it through returned a 500
  // with the database's own parse error in the body: an internal detail, sent
  // to a caller who is by definition not yet trusted.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId)) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }
  const result = body.result as string | undefined
  if (result && !RESULTS.includes(result)) {
    return NextResponse.json({ error: 'invalid_result' }, { status: 400 })
  }

  // An appointment whose time is not a time loses the appointment, not the call.
  //
  // The first real conversation ended with Telma saying "hoy, sábado, a las
  // nueve" and sending exactly that as `scheduled_at`. Postgres refused it, the
  // whole insert failed, and the clinic ended up with no record that anybody had
  // rung at all: the worst of the three possible outcomes, and the only one that
  // is invisible. Now the call is written, the bad appointment is dropped, and
  // the agent is told plainly enough to say so out loud and fix it.
  // One call can leave more than one booking, and until now only the first
  // survived. Somebody booked a lifting and a general consultation in the same
  // conversation and the panel showed one of them: `record_call` takes a single
  // appointment, so the second was dropped without a word. A lost booking is
  // worse than a failed call, because nobody knows to ring back.
  const many = Array.isArray(body.appointments)
    ? (body.appointments as Array<Record<string, unknown>>)
    : body.appointment
      ? [body.appointment as Record<string, unknown>]
      : []

  const appointment = many[0] ?? null
  const extras = many.slice(1)
  let rejected: string | null = null
  let usable: Record<string, unknown> | null = null

  if (appointment) {
    const at = appointment.scheduled_at
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
      rejected = 'scheduled_at_not_a_time'
    } else if (!plausiblePhone(appointment.patient_phone)) {
      // An appointment nobody can be rung about is barely an appointment. On a
      // real call Telma accepted "345578891", read it back digit by digit, heard
      // "sí", and wrote +345578891: seven national digits where Spain uses nine.
      // Read-back does not catch this, because the caller confirms what they
      // said, not whether it was a whole number.
      //
      // Refused while she is still on the line, which is the only moment it can
      // be put right.
      rejected = 'patient_phone_not_plausible'
    } else {
      // Rebuilt field by field rather than passed through.
      //
      // A real appointment was lost because the agent, speaking Spanish, sent
      // `origin: "telefono"` where the enum says `telefone`. Postgres refused
      // the value, the insert failed, and a correct booking with the right name,
      // the right number and the right time was thrown away over one letter.
      //
      // `origin` is not a decision: a call is a call. It is set here and no
      // longer asked for. Everything else is copied across by name, so a field
      // the model invents cannot reach the database at all.
      usable = {
        patient_name: appointment.patient_name ?? null,
        patient_phone: appointment.patient_phone ?? null,
        reason: appointment.reason ?? null,
        scheduled_at: at,
        origin: 'telefone',
        note: appointment.note ?? null,
      }
    }
  }

  const admin = createAdminClient()

  // One conversation, one call row, however many times this is asked for.
  //
  // Telma is told to register once at the end and she registered twice: after
  // the first booking and again after the second. Two call rows came out of one
  // conversation, the minutes were billed twice — 82 seconds plus 164 for a call
  // that lasted 164 — and the first appointment was written twice, so a clinic
  // saw three bookings where a patient had made two.
  //
  // `system__conversation_id` is the same on both attempts, which makes this
  // fixable here rather than by asking the model to be more careful. Retries and
  // dropped responses get the same protection for free.
  const externalRef =
    (body.call_ref as string | undefined) ?? (body.external_ref as string | undefined) ?? null

  if (externalRef) {
    const { data: seen } = await admin
      .from('calls')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('external_ref', externalRef)
      .maybeSingle()

    const existing = seen as { id: string } | null
    if (existing) {
      // The later attempt knows more than the earlier one: it has the whole
      // conversation behind it, so its summary and duration replace what the
      // first one guessed at.
      await admin
        .from('calls')
        .update({
          duration_seconds: Number(body.duration_seconds) || 0,
          result: rejected ? 'nao_resolvida' : (result ?? null),
          summary: (body.summary as string) ?? null,
        })
        .eq('id', existing.id)

      const { data: already } = await admin
        .from('appointments')
        .select('scheduled_at, patient_phone')
        .eq('call_id', existing.id)
      const seenKeys = new Set(
        ((already ?? []) as Array<{ scheduled_at: string; patient_phone: string | null }>).map(
          (a) => `${new Date(a.scheduled_at).toISOString()}|${(a.patient_phone ?? '').replace(/\D/g, '')}`
        )
      )

      const fresh = many
        .filter((a) => typeof a.scheduled_at === 'string' && !Number.isNaN(Date.parse(a.scheduled_at as string)))
        .filter((a) => plausiblePhone(a.patient_phone))
        .filter(
          (a) =>
            !seenKeys.has(
              `${new Date(a.scheduled_at as string).toISOString()}|${String(a.patient_phone ?? '').replace(/\D/g, '')}`
            )
        )
        .map((a) => ({
          clinic_id: clinicId,
          call_id: existing.id,
          patient_name: a.patient_name ?? null,
          patient_phone: a.patient_phone ?? null,
          reason: a.reason ?? null,
          scheduled_at: a.scheduled_at,
          origin: 'telefone',
          summary: (a.note as string) ?? null,
        }))

      if (fresh.length) await admin.from('appointments').insert(fresh)
      return NextResponse.json({ ok: true, call_id: existing.id, added: fresh.length })
    }
  }

  const { data, error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: (body.from_phone as string) ?? null,
    p_duration: Number(body.duration_seconds) || 0,
    p_result: rejected ? 'nao_resolvida' : (result ?? null),
    p_summary: (body.summary as string) ?? null,
    p_recording_url: (body.recording_url as string) ?? null,
    p_external_ref: externalRef,
    p_appointment: usable,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The rest, hung on the same call. Written straight rather than through
  // record_call, which would have created a second call row for a single
  // conversation and doubled the minutes.
  const callId = (data as { call_id?: string } | null)?.call_id
  if (callId && extras.length) {
    const rows = extras
      .filter((a) => typeof a.scheduled_at === 'string' && !Number.isNaN(Date.parse(a.scheduled_at as string)))
      .filter((a) => plausiblePhone(a.patient_phone))
      .map((a) => ({
        clinic_id: clinicId,
        call_id: callId,
        patient_name: a.patient_name ?? null,
        patient_phone: a.patient_phone ?? null,
        reason: a.reason ?? null,
        scheduled_at: a.scheduled_at,
        origin: 'telefone',
        // Its own note, not the call's. Until now these carried nothing at all,
        // so the second booking of a conversation reached the clinic as a bare
        // time with no word about what the patient had asked for.
        summary: (a.note as string) ?? null,
      }))
    if (rows.length) {
      const { error: extraErr } = await admin.from('appointments').insert(rows)
      // Reported, never fatal: the call and the first booking are already
      // written, and losing them too would turn a partial record into none.
      if (extraErr) console.error('[call] extra appointments', extraErr.message)
    }
  }

  if (rejected) {
    return NextResponse.json(
      {
        ok: false,
        error: rejected,
        // Written for the agent to read mid-call, because it is the only party
        // still talking to the patient and the only one who can put it right.
        message:
          rejected === 'patient_phone_not_plausible'
            ? 'A chamada ficou registada mas a marcação não: o telefone não parece um número completo. Peça-o outra vez à pessoa, diga quantos algarismos ouviu, e volte a registar. Em Espanha e em Portugal são nove algarismos.'
            : 'A chamada ficou registada mas a marcação não: scheduled_at tem de ser a hora tal como veio em slot_start, em ISO 8601. Diga à pessoa que a marcação não ficou e que a clínica liga a confirmar.',
        ...(data as object),
      },
      { status: 422 }
    )
  }

  // Release any remaining hold created during this call.
  if (body.call_ref) {
    await admin.rpc('release_slot_by_ref', { p_call_ref: body.call_ref as string })
  }

  return NextResponse.json({ ok: true, ...(data as object) })
}

/**
 * Whether a number is long enough to be a number at all.
 *
 * Deliberately not a full validator: this runs on what a voice model heard down
 * a telephone, and being strict about which ranges exist would reject real
 * people. It only catches the failure that actually happened, which is digits
 * quietly going missing.
 *
 * Spain and Portugal both use nine national digits. Anything else is checked
 * only against E.164's own bounds, because Telma answers callers from anywhere.
 */
function plausiblePhone(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  if (digits.startsWith('34') || digits.startsWith('351')) {
    const national = digits.slice(digits.startsWith('34') ? 2 : 3)
    return national.length === 9
  }
  return true
}
