'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getAppUser } from '@/lib/auth'
import { getVisitingClinic } from '@/lib/clinic-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import { dayKeyIn, dayIn } from '@/lib/time'
import {
  MOCK_DURATION_MAX,
  MOCK_DURATION_MIN,
  MOCK_REF_PREFIX,
  MOCK_SLOT_WINDOW_DAYS,
  MOCK_SUMMARY_PREFIX,
  MOCK_RESULT_TYPES,
  mockCallsEnabled,
  type MockCallReport,
  type MockCallResultType,
  type MockCallStep,
} from '@/lib/mock-call'

/**
 * Run one call the way Telma would run it.
 *
 * The three requests the voice agent makes are made here in the same order and
 * for the same reasons: read the clinic's context, ask what times are free,
 * then record what happened. The last one is `record_call`, the same function
 * the webhook calls, which is what puts the booking in the agenda, the minutes
 * on the meter and the line in the activity feed, atomically.
 *
 * Everything it writes is tagged so it can be found again: the call carries a
 * `mock-call:` external ref and the summary starts with a marker.
 */
export async function simulateCall(
  _prev: MockCallReport | null,
  formData: FormData
): Promise<MockCallReport> {
  const patientName = String(formData.get('patient_name') || '').trim().slice(0, 80)
  const patientPhone = String(formData.get('patient_phone') || '').trim().slice(0, 40)
  const minutes = clamp(
    Math.floor(Number(formData.get('duration_minutes'))) || MOCK_DURATION_MIN,
    MOCK_DURATION_MIN,
    MOCK_DURATION_MAX
  )
  const rawType = String(formData.get('result_type') || 'marcacao')
  const resultType = (
    MOCK_RESULT_TYPES.includes(rawType as MockCallResultType) ? rawType : 'marcacao'
  ) as MockCallResultType

  const durationSeconds = minutes * 60
  const blank = (error: MockCallReport['error']): MockCallReport => ({
    outcome: 'error',
    error,
    patient_name: patientName,
    duration_seconds: durationSeconds,
    minutes_deducted: 0,
    minutes_before: 0,
    minutes_after: 0,
    allowance: 0,
    appointment_at: null,
    steps: [],
  })

  if (!mockCallsEnabled()) return blank('unavailable')
  if (!patientName || !patientPhone) return blank('generic')

  const clinicId = await currentClinicId()
  if (!clinicId) return blank('forbidden')

  // Step one: GET /api/clinic-context. Same read, same function.
  const before = await getClinicWithPlan(clinicId)
  if (!before) return blank('clinic')

  const steps: MockCallStep[] = [
    {
      key: 'context',
      state: 'ok',
      detail: `${Math.round(before.minutes.remaining)}/${before.minutes.allowance}`,
    },
  ]

  const admin = createAdminClient()
  const tz = before.clinic.timezone || 'Europe/Lisbon'
  const externalRef = `${MOCK_REF_PREFIX}${randomUUID()}`

  // Step two: GET /api/availability. Only a booking needs a time, and only a
  // clinic with minutes left is offered one — that is the endpoint's own rule,
  // repeated here because the agent would have been told the same thing.
  let slot: string | null = null
  if (resultType === 'marcacao') {
    if (before.minutes.exhausted) {
      steps.push({ key: 'availability', state: 'blocked' })
    } else {
      slot = await firstFreeSlot(admin, clinicId, tz)
      steps.push({
        key: 'availability',
        state: slot ? 'ok' : 'blocked',
        detail: slot ?? undefined,
      })
    }
  } else {
    steps.push({ key: 'availability', state: 'skipped' })
  }

  const booking = resultType === 'marcacao' && slot !== null

  // What the clinic will read in the agenda tomorrow morning. Written the way
  // Telma writes it, with the marker that says a person did not call.
  const summary = booking
    ? `${MOCK_SUMMARY_PREFIX} A Telma marcou uma consulta para ${patientName}.`
    : resultType === 'transferida'
      ? `${MOCK_SUMMARY_PREFIX} Chamada urgente de ${patientName}, passada para a receção.`
      : resultType === 'informacao'
        ? `${MOCK_SUMMARY_PREFIX} ${patientName} perguntou por horários e serviços.`
        : `${MOCK_SUMMARY_PREFIX} ${patientName} quis marcar, sem horas disponíveis.`

  // The result the agent would have recorded. A booking that could not be made
  // is 'nao_resolvida': the call happened, the patient hung up without a time,
  // and pretending otherwise would put a marcação in the counters that never
  // existed.
  const callResult = booking
    ? 'marcacao'
    : resultType === 'transferida'
      ? 'transferida'
      : resultType === 'informacao'
        ? 'informacao'
        : 'nao_resolvida'

  // Step three: the webhook's own function. Call, booking, meter, activity
  // feed and the 80% warning, in one transaction.
  const { error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: patientPhone,
    p_duration: durationSeconds,
    p_result: callResult,
    p_summary: summary,
    p_recording_url: null,
    p_external_ref: externalRef,
    p_appointment: booking
      ? {
          patient_name: patientName,
          patient_phone: patientPhone,
          reason: null,
          scheduled_at: slot,
          origin: 'telefone',
        }
      : null,
  })

  if (error) return blank('generic')

  steps.push({ key: 'appointment', state: booking ? 'ok' : 'skipped' })
  steps.push({ key: 'call', state: 'ok', detail: `${minutes}` })

  // Read the meter again rather than subtracting. What the panel is about to
  // show is what the database says, and if the two ever disagree the tool
  // should be the one telling the truth.
  const after = await getClinicWithPlan(clinicId)

  refresh()

  return {
    outcome: booking
      ? 'booked'
      : resultType === 'transferida'
        ? 'transferred'
        : resultType === 'informacao'
          ? 'informed'
          : before.minutes.exhausted
            ? 'no_minutes'
            : 'no_slots',
    patient_name: patientName,
    duration_seconds: durationSeconds,
    minutes_deducted: minutes,
    minutes_before: Math.round(before.minutes.used),
    minutes_after: Math.round(after?.minutes.used ?? before.minutes.used + minutes),
    allowance: after?.minutes.allowance ?? before.minutes.allowance,
    appointment_at: booking ? slot : null,
    steps,
  }
}

/**
 * Undo every simulation this clinic has run.
 *
 * The bookings go with the calls that created them, which is what the tag is
 * for. The meter is not rewound: `usage` is what the clinic is billed on and
 * quietly editing it from a test page is the one thing a test page must never
 * do. In a development database that is noise; in the demo the store is rebuilt
 * on every restart anyway.
 */
export async function clearSimulatedCalls(
  _prev: { removed: number } | null,
  _formData: FormData
): Promise<{ removed: number }> {
  if (!mockCallsEnabled()) return { removed: 0 }
  const clinicId = await currentClinicId()
  if (!clinicId) return { removed: 0 }

  const admin = createAdminClient()
  const { data } = await admin
    .from('calls')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('external_ref', `${MOCK_REF_PREFIX}%`)

  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id)
  if (ids.length === 0) return { removed: 0 }

  for (const id of ids) {
    await admin.from('appointments').delete().eq('clinic_id', clinicId).eq('call_id', id)
    await admin.from('calls').delete().eq('clinic_id', clinicId).eq('id', id)
  }

  refresh()
  return { removed: ids.length }
}

// Whose clinic this is. A clinic user runs a call against its own; the
// administrator, against the one it currently has open. Never from the form:
// the client does not get to name the clinic it writes to.
async function currentClinicId(): Promise<string | null> {
  const user = await getAppUser()
  if (!user) return null
  if (user.role === 'clinica') return user.clinic_id ?? null
  const visiting = await getVisitingClinic()
  return visiting?.id ?? null
}

// The first free time from today onward, which is what the agent would offer.
// Times already past today are skipped: an agenda has 09:00 free all afternoon
// and no patient is booked into this morning.
async function firstFreeSlot(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  tz: string
): Promise<string | null> {
  const now = new Date()

  for (let offset = 0; offset < MOCK_SLOT_WINDOW_DAYS; offset++) {
    const date = dayKeyIn(tz, dayIn(tz, offset, now))
    const { data } = await admin.rpc('available_slots', { p_clinic_id: clinicId, p_date: date })
    const slots = (data ?? []) as { slot_start: string; remaining: number }[]

    for (const s of slots) {
      if (s.remaining > 0 && new Date(s.slot_start).getTime() > now.getTime()) {
        return new Date(s.slot_start).toISOString()
      }
    }
  }
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// A simulated call moves the agenda, the tallies and the minutes bar at once.
function refresh() {
  revalidatePath('/', 'layout')
}
