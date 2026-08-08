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
  const appointment = body.appointment as Record<string, unknown> | null | undefined
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
      }
    }
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: (body.from_phone as string) ?? null,
    p_duration: Number(body.duration_seconds) || 0,
    p_result: rejected ? 'nao_resolvida' : (result ?? null),
    p_summary: (body.summary as string) ?? null,
    p_recording_url: (body.recording_url as string) ?? null,
    p_external_ref: (body.external_ref as string) ?? null,
    p_appointment: usable,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
