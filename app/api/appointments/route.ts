import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizedWebhook } from '@/lib/api-auth'
import { getClinicWithPlan } from '@/lib/clinic-utils'

/**
 * Cancelling by telephone, the way a receptionist does it.
 *
 * Two layers, in this order: the number the person is ringing from finds the
 * appointments, and the name they give unlocks the one they mean. Neither is
 * enough alone. The number is not a secret, and a name without a number would
 * mean anybody who knows somebody's name can cancel their appointment.
 *
 * The important detail is what this refuses to say. The lookup returns times
 * and reasons and **never the name on the booking**. Reading it out and asking
 * "is that you?" is not verification, it is handing over the answer and then
 * asking the question. So the caller says the name and the database compares it.
 *
 * The comparison lives in SQL rather than in the prompt, because a rule written
 * in a prompt is a rule that can be talked out of.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Row {
  id: string
  scheduled_at: string
  reason: string | null
  status: string
}

// GET /api/appointments?clinic_id=...&phone=+34...
//
// What this number has booked, and whether it belongs to a patient at all. The
// second answer is what decides, out of hours, whether a stranger gets to ring
// somebody's doctor at three in the morning.
export async function GET(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const clinicId = searchParams.get('clinic_id')
  const phone = searchParams.get('phone')
  if (!clinicId || !phone) {
    return NextResponse.json({ error: 'clinic_id_and_phone_required' }, { status: 400 })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })

  const admin = createAdminClient()
  const [{ data: rows }, { data: patient }] = await Promise.all([
    admin.rpc('appointments_by_phone', { p_clinic_id: clinicId, p_phone: phone }),
    admin.rpc('is_clinic_patient', { p_clinic_id: clinicId, p_phone: phone }),
  ])

  const zone = context.clinic.timezone
  const locale = context.clinic.language === 'es' ? 'es-ES' : 'pt-PT'
  const spoken = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return NextResponse.json({
    is_patient: patient === true,
    // Times to read out, and an id to hand back. No names: see above.
    appointments: ((rows ?? []) as Row[]).map((r) => ({
      appointment_id: r.id,
      say: spoken.format(new Date(r.scheduled_at)),
      reason: r.reason,
      status: r.status,
    })),
  })
}

// POST /api/appointments  { clinic_id, appointment_id, phone, name, reason }
//
// Cancels, if the name given matches the name on the booking.
export async function POST(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clinicId = body.clinic_id as string | undefined
  const appointmentId = body.appointment_id as string | undefined
  const phone = body.phone as string | undefined
  const name = body.name as string | undefined
  if (!clinicId || !appointmentId || !phone || !name) {
    return NextResponse.json(
      { error: 'clinic_id_appointment_id_phone_and_name_required' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('cancel_appointment_by_phone', {
    p_clinic_id: clinicId,
    p_appointment_id: appointmentId,
    p_phone: phone,
    p_name: name,
    p_reason: (body.reason as string) ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as { ok: boolean; error?: string }
  if (!result?.ok) {
    // Told in words the agent can act on. A refusal she cannot explain becomes
    // an apology and a dead end, and the person rings back angrier.
    return NextResponse.json(
      {
        ...result,
        message:
          result?.error === 'name_does_not_match' || result?.error === 'name_too_short'
            ? 'O nome não bate certo com o da marcação. Peça o nome completo uma vez mais. Se continuar a não bater, não cancele: tome o recado e diga que a clínica confirma.'
            : result?.error === 'phone_does_not_match'
              ? 'Essa marcação não é deste número. Não cancele.'
              : 'Não foi possível cancelar. Tome o recado e diga que a clínica trata disso.',
      },
      { status: 409 }
    )
  }

  return NextResponse.json(result)
}
