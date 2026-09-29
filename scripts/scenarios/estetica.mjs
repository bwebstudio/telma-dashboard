/**
 * An aesthetic clinic, which is a different map of risk from a dental one.
 *
 * The shared fixture for the three scenarios that matter most here. Nothing in
 * it is unusual: an ordinary clinic offering the ordinary things, so that
 * anything the scenarios find is about the base and not about a clinic set up
 * to fail.
 */
const THURSDAY = '2026-08-27'

export const clinic = {
  clinic_name: 'Clínica Estética Aurora',
  specialty: 'Clínica estética',
  address: 'Calle Serrano 40, Madrid',
  phone: '+34910000000',
  timezone: 'Europe/Madrid',
  professionals: [],
  caller_id: '+34644111222',
  veterinary: false,
  services: [
    'est_consulta',
    'est_laser',
    'est_hialuronico',
    'est_botox',
    'est_peeling',
  ],
  custom_services: null,
  opening_hours: ['Jueves: 10:00-20:00', 'Viernes: 10:00-20:00'],
  appointment_duration_minutes: 45,
  languages: ['Español'],
  formality: 'formal',
  price_info: 'Consulta de valoración 30 €. Depilación láser desde 45 € por zona.',
  fallback_policy: 'message',
  fallback_number: null,
  briefing: null,
  can_book: true,
  within_opening_hours: true,
  emergency_number: null,
  emergency_protocol: null,
  recording: true,
  after_hours_transfer: false,
  after_hours_patients_only: true,
  after_hours_number: null,
}

export const tools = [
  'tool_6701kzp6904wemhtcakyhcj2y7kb',
  'tool_1701kzp690abegpvsdqqdthbperf',
  'tool_8601kzp690f3fcgtwn2338fm721g',
  'tool_3401kzp690kyem0vp0gdrt6b0gy7',
  'tool_5301kzp690rye3kbgkk7kk17v6rn',
]

export const dynamicVariables = {
  clinic_id: '11111111-1111-1111-1111-111111111111',
  system__conversation_id: 'sim-estetica',
  system__caller_id: '+34644111222',
  system__call_duration_secs: '180',
  clinic_name: 'Clínica Estética Aurora',
  clinic_timezone: 'Europe/Madrid',
  clinic_language: 'es',
  can_book: 'true',
  prompt_version: 'sim',
  fallback_number: '+34910000000',
  emergency_number: '',
}

export const toolMocks = {
  telma_ver_marcacoes_demo: { is_patient: true, appointments: [] },
  telma_horas_livres_demo: {
    days_with_slots: [THURSDAY],
    duration_minutes: 45,
    slots: [
      { slot_start: `${THURSDAY}T09:00:00Z`, local_time: '11:00', say: 'jueves 27 a las once de la mañana' },
      { slot_start: `${THURSDAY}T16:00:00Z`, local_time: '18:00', say: 'jueves 27 a las seis de la tarde' },
    ],
  },
  telma_reservar_hora_demo: { ok: true },
  telma_registar_chamada_demo: { ok: true, call_id: 'sim' },
}

export const shared = { language: 'es', clinic, tools, dynamicVariables, toolMocks }
