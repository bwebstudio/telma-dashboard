import type { Values } from '@/components/onboarding/FormSections'
import type { SchemaSection } from './wizard-schema'

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

    // The only branch on sale: a clinic keeps its own line and forwards it.
    // It was 'new' until Twilio stopped being able to sell a number in either
    // country; see NEW_NUMBERS_ON_SALE in ./catalog. `newNumberSignup` below
    // keeps the other branch ready for the day it comes back.
    phone_option: 'keep',
    current_number: '+351212345678',
    operator: 'MEO',
    forward_type: 'no_answer',
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

/**
 * The expensive forward: everything, not just what nobody picked up.
 *
 * Worth its own run because the two are not a preference. 'no_answer' sends
 * Telma the overflow; 'all' stops the clinic's own telephone ringing and sends
 * her every call, which spends a 250 minute plan in days. It used to be the
 * only fixture with `phone_option: 'keep'` and it carried no `forward_type` at
 * all, so it had been failing step 3 on a required field.
 */
export function portingSignup(suffix: string): Values {
  return {
    ...validSignup(suffix),
    operator: 'Vodafone',
    forward_type: 'all',
  }
}

/**
 * A clinic asking for a number of its own.
 *
 * Refused while NEW_NUMBERS_ON_SALE is off, which is what the invalid case
 * below checks. Kept here, and kept correct, so turning the option back on is
 * one constant and not an archaeology exercise.
 */
export function newNumberSignup(suffix: string): Values {
  return {
    ...validSignup(suffix),
    phone_option: 'new',
    current_number: '',
    operator: '',
    area_region: 'lisboa',
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
  /** Which part of the rules this exercises. It used to be a step number from
   *  one to six; the sign-up has had three steps since the hours, the services
   *  and the way Telma answers moved to the panel, so six of these were being
   *  run against the wrong schema (and passing) and the rest were crashing on
   *  a step that no longer exists. */
  where: SchemaSection
  what: string
  expect: string
  values: Values
}> = [
  {
    where: 2,
    what: 'Nome com dois caracteres',
    expect: 'clinic_name',
    values: { ...validSignup('x'), clinic_name: 'Dr' },
  },
  {
    where: 2,
    what: 'Telefone em formato nacional, sem +351',
    expect: 'phone',
    values: { ...validSignup('x'), phone: '211234567' },
  },
  {
    where: 'hours',
    what: 'Fecha antes de abrir',
    expect: 'weekdays.close',
    values: {
      ...validSignup('x'),
      weekdays: { closed: false, open: '19:00', close: '09:00' },
    },
  },
  {
    where: 'hours',
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
    where: 'services',
    what: 'Nenhum serviço escolhido',
    expect: 'services',
    values: { ...validSignup('x'), services: [] },
  },
  {
    where: 'services',
    what: 'Serviço que não existe no catálogo',
    expect: 'services',
    values: { ...validSignup('x'), services: ['dent_teletransporte'] },
  },
  {
    where: 'telma',
    // Was "a voice that does not exist", checking a `voice_id` the browser
    // used to send. It stopped being a question: the voice is derived on the
    // server from the language the clinic greets in, so there was no rule left
    // for the case to catch and it passed every run.
    what: 'O mesmo idioma escolhido duas vezes',
    expect: 'selected_languages',
    values: { ...validSignup('x'), selected_languages: ['pt', 'pt'] },
  },
  {
    where: 3,
    what: 'Quer manter o número mas não diz qual',
    expect: 'current_number',
    values: { ...validSignup('x'), phone_option: 'keep', operator: 'MEO', current_number: '' },
  },
  {
    where: 3,
    what: 'Pede um número novo, que não estamos a atribuir',
    expect: 'phone_option',
    values: newNumberSignup('x'),
  },
  {
    where: 3,
    what: 'Não aceitou os termos',
    expect: 'terms',
    values: { ...validSignup('x'), terms: false },
  },
  {
    where: 1,
    what: 'Plano personalizado, que não se compra num formulário',
    expect: 'plan_id',
    values: { ...validSignup('x'), plan_id: 'personalizado' },
  },
]
