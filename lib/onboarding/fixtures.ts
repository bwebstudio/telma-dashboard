import type { Values } from '@/components/onboarding/FormSections'

/**
 * A sign-up that should go all the way through, and several that should not.
 *
 * These are for the end to end page, not for a test runner: there is no test
 * framework in this project, and the thing worth checking here is not that zod
 * rejects a bad email. It is that six steps, a draft store, a number, a login,
 * a week of slots and an email all happen in the right order against the real
 * database. That is a page you watch, not an assertion.
 *
 * `suffix` keeps two runs from colliding on the unique index over the login
 * email. Passed in rather than generated here so the caller decides, and so
 * this module stays free of anything that changes between calls.
 */
export function validSignup(suffix: string): Values {
  return {
    clinic_name: `Clínica de Teste ${suffix}`,
    email: `teste+${suffix}@telmaatende.com`,
    phone: '+351211234567',
    specialty: 'dentaria',
    region: 'lisboa',
    locale: 'pt',

    weekdays: { closed: false, open: '09:00', close: '19:00' },
    saturday: { closed: false, open: '09:00', close: '13:00' },
    sunday: { closed: true, open: '09:00', close: '13:00' },
    pause: { enabled: true, start: '13:00', end: '14:00' },
    appointment_duration_minutes: 30,
    min_interval_minutes: 30,

    services: ['dent_consulta', 'dent_limpeza', 'dent_implantes'],
    custom_services: 'Consulta de urgência ao sábado',

    selected_languages: ['pt', 'en'],
    greeting_language: 'pt',
    formality: 'formal',
    fallback_policy: 'message',
    fallback_number: '',
    address: 'Rua das Flores 12, Lisboa',
    price_info: 'Primeira consulta 40 €.',
    briefing: 'Estacionamento na rua de trás.',

    phone_option: 'new',
    area_region: 'lisboa',

    plan_id: 'clinica',
    billing_cycle: 'monthly',
    addon_whatsapp: true,
    terms: true,
  }
}

/**
 * The same sign-up from Spain, in Spanish.
 *
 * Not a translation of the fixture: a different country, which is the part
 * worth exercising. It should end with a Madrid area code, a +34 number and a
 * clinic on Europe/Madrid, and if any of those come back Portuguese then the
 * region-implies-country rule has broken somewhere.
 */
export function spanishSignup(suffix: string): Values {
  return {
    ...validSignup(suffix),
    clinic_name: `Clínica de Prueba ${suffix}`,
    phone: '+34911234567',
    region: 'es-madrid',
    area_region: 'es-madrid',
    locale: 'es',
    // A Barcelona clinic answering in Spanish and Catalan, which is two of the
    // three its plan includes. No language is compulsory: it never chose
    // Portuguese and nothing adds it.
    selected_languages: ['es', 'ca'],
    greeting_language: 'ca',
    address: 'Carrer de Gràcia 8, Barcelona',
  }
}

/** The other branch of step 5: a clinic keeping the number it already has. */
export function portingSignup(suffix: string): Values {
  return {
    ...validSignup(suffix),
    phone_option: 'keep',
    current_number: '+351212345678',
    operator: 'MEO',
  }
}

/**
 * One broken payload per step, each broken in the way that actually happens.
 *
 * Not "every field empty": that proves the schema runs and nothing else. These
 * are the mistakes a real applicant makes, and each one names the rule it is
 * there to exercise.
 */
export const INVALID_CASES: Array<{
  step: number
  what: string
  expect: string
  values: Values
}> = [
  {
    step: 1,
    what: 'Nome com dois caracteres',
    expect: 'clinic_name',
    values: { ...validSignup('x'), clinic_name: 'Dr' },
  },
  {
    step: 1,
    what: 'Telefone em formato nacional, sem +351',
    expect: 'phone',
    values: { ...validSignup('x'), phone: '211234567' },
  },
  {
    step: 2,
    what: 'Fecha antes de abrir',
    expect: 'weekdays.close',
    values: {
      ...validSignup('x'),
      weekdays: { closed: false, open: '19:00', close: '09:00' },
    },
  },
  {
    step: 2,
    what: 'Fechada todos os dias',
    expect: 'weekdays',
    values: {
      ...validSignup('x'),
      weekdays: { closed: true, open: '09:00', close: '19:00' },
      saturday: { closed: true, open: '09:00', close: '13:00' },
      sunday: { closed: true, open: '09:00', close: '13:00' },
    },
  },
  {
    step: 3,
    what: 'Nenhum serviço escolhido',
    expect: 'services',
    values: { ...validSignup('x'), services: [] },
  },
  {
    step: 3,
    what: 'Serviço que não existe no catálogo',
    expect: 'services',
    values: { ...validSignup('x'), services: ['dent_teletransporte'] },
  },
  {
    step: 4,
    what: 'Voz que não existe',
    expect: 'voice_id',
    values: { ...validSignup('x'), voice_id: 'voz-inventada' },
  },
  {
    step: 5,
    what: 'Quer manter o número mas não diz qual',
    expect: 'current_number',
    values: { ...validSignup('x'), phone_option: 'keep', operator: 'MEO' },
  },
  {
    step: 6,
    what: 'Não aceitou os termos',
    expect: 'terms',
    values: { ...validSignup('x'), terms: false },
  },
  {
    step: 6,
    what: 'Plano personalizado, que não se compra num formulário',
    expect: 'plan_id',
    values: { ...validSignup('x'), plan_id: 'personalizado' },
  },
]
