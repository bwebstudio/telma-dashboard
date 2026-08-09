import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingLocale } from './locale'

/**
 * A morning's work, waiting in a clinic that was created a minute ago.
 *
 * Only on a showcase deployment, and the reason is what happens without it. A
 * salesperson takes somebody through the sign-up, presses the last button, opens
 * the panel — and finds an empty agenda, an empty conversation list and three
 * counters at zero. Everything works and it demonstrates nothing. The person
 * being shown has to imagine the product, which is exactly what a demonstration
 * exists to spare them.
 *
 * The calls go in through `record_call`, the same function a real conversation
 * uses. They therefore consume minutes and appear in the counters exactly as
 * real ones would, which is the point: what is shown is the product, not a
 * drawing of it.
 *
 * Deliberately modest. Three calls and two bookings read as a quiet morning at a
 * small practice. Thirty would read as a fixture file.
 */

interface Sample {
  from: string
  duration: number
  result: 'marcacao' | 'informacao' | 'nao_resolvida'
  summary: string
  patient?: string
  reason?: string
  /** Days from today. The hour comes from the clinic's own free slots. */
  inDays?: number
}

const SAMPLES: Record<OnboardingLocale, Sample[]> = {
  pt: [
    {
      from: '+351 912 000 111',
      duration: 143,
      result: 'marcacao',
      summary:
        'Queria uma primeira consulta, o mais cedo possível. Ficou marcada e confirmou o nome e o telefone.',
      patient: 'Marta Ribeiro',
      reason: 'Primeira consulta',
      inDays: 1,
    },
    {
      from: '+351 936 000 222',
      duration: 96,
      result: 'marcacao',
      summary: 'Pediu uma limpeza para a semana. Escolheu a hora da tarde.',
      patient: 'Nuno Faria',
      reason: 'Limpeza',
      inDays: 3,
    },
    {
      from: '+351 917 000 333',
      duration: 54,
      result: 'informacao',
      summary:
        'Perguntou pelo horário e se havia estacionamento. Não quis marcar para já, disse que voltava a ligar.',
    },
  ],
  es: [
    {
      from: '+34 612 000 111',
      duration: 143,
      result: 'marcacao',
      summary:
        'Quería una primera consulta, lo antes posible. Quedó reservada y confirmó el nombre y el teléfono.',
      patient: 'Marta Ribera',
      reason: 'Primera consulta',
      inDays: 1,
    },
    {
      from: '+34 636 000 222',
      duration: 96,
      result: 'marcacao',
      summary: 'Pidió una limpieza para la semana que viene. Eligió la hora de la tarde.',
      patient: 'Nuno Farias',
      reason: 'Limpieza',
      inDays: 3,
    },
    {
      from: '+34 617 000 333',
      duration: 54,
      result: 'informacao',
      summary:
        'Preguntó por el horario y si había aparcamiento. No quiso reservar de momento, dijo que volvería a llamar.',
    },
  ],
}

export async function seedShowcaseClinic(
  clinicId: string,
  locale: OnboardingLocale
): Promise<void> {
  const admin = createAdminClient()
  const samples = SAMPLES[locale] ?? SAMPLES.pt

  for (const s of samples) {
    let scheduledAt: string | null = null

    if (s.patient && s.inDays !== undefined) {
      // A real free hour from this clinic's own timetable, not an invented one.
      // A booking at a time the clinic is shut is the first thing somebody
      // notices, and it undoes every other detail at once.
      const day = new Date()
      day.setDate(day.getDate() + s.inDays)
      const { data } = await admin.rpc('available_slots', {
        p_clinic_id: clinicId,
        p_date: day.toISOString().slice(0, 10),
      })
      const slots = (data ?? []) as Array<{ slot_start: string }>
      const future = slots.filter((x) => Date.parse(x.slot_start) > Date.now())
      // Not the first one: the earliest slot of the day is the one a salesperson
      // will want to offer while showing the booking flow.
      scheduledAt = future[Math.min(2, future.length - 1)]?.slot_start ?? null
    }

    await admin.rpc('record_call', {
      p_clinic_id: clinicId,
      p_from_phone: s.from,
      p_duration: s.duration,
      p_result: scheduledAt ? s.result : s.result === 'marcacao' ? 'informacao' : s.result,
      p_summary: s.summary,
      p_recording_url: null,
      p_external_ref: null,
      p_appointment:
        scheduledAt && s.patient
          ? {
              patient_name: s.patient,
              patient_phone: s.from,
              reason: s.reason,
              scheduled_at: scheduledAt,
              origin: 'telefone',
            }
          : null,
    })
  }
}
