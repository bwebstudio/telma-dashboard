import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import { allServices, canonicalReason, resolveDuration } from '@/lib/service-duration'
import { serviceLabel } from '@/lib/onboarding/catalog'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Does this clinic do the thing the caller just asked for?
 *
 * GET /api/service-check?clinic_id=...&said=el%20laser
 *
 * Step 2 of a booking, moved out of the prompt and into code.
 *
 * It was the model comparing what it heard against a list of service names
 * written into its instructions, which is a string-matching job given to the
 * one part of the system that cannot be relied on to do string matching. The
 * failure is the expensive kind and it has happened: somebody asked for
 * whitening at a clinic that does not whiten and left with an appointment for
 * whitening, which means crossing the city to be told no.
 *
 * The matching itself is not new and is not written here. `matchService` has
 * been doing it since the diary needed to know how long to leave, and it is
 * careful in the ways that matter -- accents and punctuation flattened, an
 * exact id first, then a label in either language, then a label contained in
 * what was said, and it answers only when exactly one service fits. A clinic
 * with two things called "Consulta de valoración" gets neither rather than the
 * wrong one. All this does is put a door on it.
 *
 * ── WHY IT ALSO RETURNS WHAT THE CLINIC DOES DO ────────────────────────────
 * Because the base already tells her to offer the nearest thing, and she was
 * getting that list from the same instructions she was failing to match
 * against. A refusal that comes with three real alternatives is a receptionist;
 * a bare "we do not do that" is a wall, and the caller rings somewhere else.
 *
 * Three, not all of them: nobody on a telephone can hold a list, which is a
 * rule the base states and which this must not quietly undo.
 */
export async function GET(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clinicId = searchParams.get('clinic_id')
  const said = searchParams.get('said')
  if (!clinicId || !said) {
    return NextResponse.json({ error: 'clinic_id_and_said_required' }, { status: 400 })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }

  const clinic = context.clinic
  const source = {
    services: clinic.services,
    custom_services: clinic.custom_services,
    language: clinic.language,
    service_durations: clinic.service_durations,
    appointment_duration_minutes: clinic.appointment_duration_minutes,
  }

  const servico = canonicalReason(source, said)
  const locale: OnboardingLocale = clinic.language === 'pt' ? 'pt' : 'es'

  if (servico) {
    return NextResponse.json({
      // Named in the clinic's own language so that what she says out loud, what
      // goes in the panel and what the diary is asked about are one string.
      faz: true,
      servico,
      minutos: resolveDuration(source, said).minutes,
    })
  }

  return NextResponse.json({
    faz: false,
    servico: null,
    // A custom service is already the line the clinic typed; a catalogue id has
    // to be turned back into words somebody would recognise.
    alternativas: allServices(source)
      .slice(0, 3)
      .map((id) => (serviceLabel(id, locale) === id ? id : serviceLabel(id, locale))),
  })
}
