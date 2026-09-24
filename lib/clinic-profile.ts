import type { Clinic } from '@/lib/types'

/**
 * The clinic row, in the shape the sign-up's fields expect.
 *
 * Two screens edit this profile now: Telma, which owns how she answers, and
 * the account page, which owns who the clinic is. Both send the whole thing
 * back, because `updateClinicProfile` validates the sign-up's steps as wholes
 * and a partial payload fails on the fields it was never given. So the mapping
 * lives here rather than being written out twice and drifting the first time a
 * column is added.
 */
export function clinicProfileValues(clinic: Clinic): Record<string, unknown> {
  return {
    clinic_name: clinic.name ?? '',
    email: clinic.contact_email ?? '',
    address: clinic.address ?? '',
    phone: clinic.phone ?? '',
    specialty: clinic.specialty ?? '',
    region: clinic.region ?? '',
    services: clinic.services ?? [],
    // So a screen opens showing the lengths already in force rather than blank
    // boxes that would quietly wipe them on the next save.
    service_durations: clinic.service_durations ?? {},
    service_prices: clinic.service_prices ?? {},
    custom_services: clinic.custom_services ?? '',
    price_info: clinic.price_info ?? '',
    appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
    formality: clinic.formality ?? 'formal',
    fallback_policy: clinic.fallback_policy ?? 'message',
    fallback_number: clinic.fallback_number ?? '',
    briefing: clinic.briefing ?? '',
    emergency_number: clinic.emergency_number ?? '',
    emergency_protocol: clinic.emergency_protocol ?? '',
    after_hours_transfer: clinic.after_hours_transfer === true,
    after_hours_number: clinic.after_hours_number ?? '',
    after_hours_patients_only: clinic.after_hours_patients_only !== false,
    calls_recorded: clinic.calls_recorded !== false,
    selected_languages: clinic.selected_languages ?? [clinic.language ?? 'pt'],
    greeting_language: clinic.language ?? 'pt',
  }
}
