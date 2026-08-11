import { z } from 'zod'
import { ALL_SERVICE_IDS, OPERATORS, REGION_IDS, SIGNUP_PLANS, SPECIALTIES } from './catalog'
import { DEFAULT_ONBOARDING_LOCALE, type OnboardingLocale } from './locale'

/**
 * What a valid answer looks like, at every step of the sign-up.
 *
 * One schema per step, and the same schema runs in both places: the browser
 * checks it before advancing so nobody loses six steps of typing to a typo, and
 * the server checks it again before writing, because a POST does not have to
 * come from our form. The client side is a convenience; this file is the rule.
 *
 * The schemas are built per language rather than declared once, so the sentence
 * a Spanish clinic reads under a bad phone number is Spanish. The messages sit
 * next to the constraint that produces them, which is the point of building
 * them this way instead of emitting codes and translating somewhere else: a
 * validation message that lives far from its rule ends up describing a rule
 * that has since changed.
 */

// Phone numbers are stored in E.164 and nothing else: it is what Twilio dials,
// what the voice webhook reports a caller as, and the only format two numbers
// can be compared in. `+351 21 123 4567` and `+351211234567` are the same
// number and must not be two rows. The pattern is deliberately not
// country-specific: Telma sells in two countries and will sell in a third.
const E164 = /^\+[1-9]\d{7,14}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Strips the spaces, dots and dashes people type, so `+34 91 123 45 67` passes. */
export function normalisePhone(input: string): string {
  return input.replace(/[\s.\-()]/g, '')
}

interface Messages {
  nameShort: string
  nameLong: string
  email: string
  phone: string
  specialty: string
  region: string
  time: string
  closeBeforeOpen: string
  pauseEndBeforeStart: string
  neverOpen: string
  durationMin: string
  durationMax: string
  intervalMin: string
  intervalMax: string
  servicesMin: string
  servicesUnknown: string
  customTooLong: string
  voice: string
  languageMin: string
  duplicateLanguage: string
  greetingLanguage: string
  greetingNotSelected: string
  languageTooMany: string
  addressLong: string
  priceTooLong: string
  briefingTooLong: string
  fallbackNumber: string
  emergencyNumber: string
  emergencyTooLong: string
  afterHoursNumberRequired: string
  operator: string
  areaRegion: string
  plan: string
  terms: string
}

const MESSAGES: Record<OnboardingLocale, Messages> = {
  pt: {
    nameShort: 'O nome da clínica precisa de pelo menos 3 caracteres.',
    nameLong: 'O nome da clínica é demasiado longo.',
    email: 'Indique um email válido.',
    phone: 'Indique o número em formato internacional, por exemplo +351211234567 ou +34911234567.',
    specialty: 'Escolha a área da clínica.',
    region: 'Escolha a região.',
    time: 'Use o formato 24 horas, por exemplo 09:00.',
    closeBeforeOpen: 'A hora de fecho tem de ser depois da hora de abertura.',
    pauseEndBeforeStart: 'O fim da pausa tem de ser depois do início.',
    neverOpen: 'A clínica tem de estar aberta pelo menos um dia.',
    durationMin: 'A consulta tem de durar pelo menos 5 minutos.',
    durationMax: 'A consulta não pode durar mais de 4 horas.',
    intervalMin: 'O intervalo tem de ser de pelo menos 5 minutos.',
    intervalMax: 'O intervalo não pode ser maior do que 4 horas.',
    servicesMin: 'Escolha pelo menos um serviço.',
    servicesUnknown: 'Um dos serviços escolhidos não existe.',
    customTooLong: 'Máximo de 500 caracteres.',
    voice: 'Escolha uma voz.',
    languageMin: 'Escolha pelo menos um idioma.',
    duplicateLanguage: 'Esse idioma está repetido.',
    greetingLanguage: 'Escolha o idioma em que a Telma abre a chamada.',
    greetingNotSelected: 'A Telma só pode abrir num idioma que escolheu.',
    languageTooMany: 'Escolheu mais idiomas do que este plano inclui.',
    addressLong: 'A morada é demasiado longa.',
    priceTooLong: 'Máximo de 1000 caracteres.',
    briefingTooLong: 'Máximo de 2000 caracteres.',
    fallbackNumber: 'Indique o número para onde passar a chamada, em formato internacional.',
    emergencyNumber: 'Indique o número de urgência em formato internacional, por exemplo +351911234567.',
    emergencyTooLong: 'Máximo de 1000 caracteres.',
    afterHoursNumberRequired: 'Indique para onde vai a chamada fora de horas, aqui ou no número de urgências.',
    operator: 'Escolha a operadora atual.',
    areaRegion: 'Escolha a região do novo número.',
    plan: 'Escolha um plano.',
    terms: 'É preciso aceitar os termos para continuar.',
  },
  es: {
    nameShort: 'El nombre de la clínica necesita al menos 3 caracteres.',
    nameLong: 'El nombre de la clínica es demasiado largo.',
    email: 'Indique un email válido.',
    phone: 'Indique el número en formato internacional, por ejemplo +34911234567 o +351211234567.',
    specialty: 'Elija el área de la clínica.',
    region: 'Elija la provincia.',
    time: 'Use el formato de 24 horas, por ejemplo 09:00.',
    closeBeforeOpen: 'La hora de cierre tiene que ser posterior a la de apertura.',
    pauseEndBeforeStart: 'El fin de la pausa tiene que ser posterior al inicio.',
    neverOpen: 'La clínica tiene que estar abierta al menos un día.',
    durationMin: 'La cita tiene que durar al menos 5 minutos.',
    durationMax: 'La cita no puede durar más de 4 horas.',
    intervalMin: 'El intervalo tiene que ser de al menos 5 minutos.',
    intervalMax: 'El intervalo no puede ser mayor de 4 horas.',
    servicesMin: 'Elija al menos un servicio.',
    servicesUnknown: 'Uno de los servicios elegidos no existe.',
    customTooLong: 'Máximo de 500 caracteres.',
    voice: 'Elija una voz.',
    languageMin: 'Elija al menos un idioma.',
    duplicateLanguage: 'Ese idioma está repetido.',
    greetingLanguage: 'Elija el idioma con el que Telma descuelga.',
    greetingNotSelected: 'Telma solo puede abrir en un idioma que haya elegido.',
    languageTooMany: 'Ha elegido más idiomas de los que incluye este plan.',
    addressLong: 'La dirección es demasiado larga.',
    priceTooLong: 'Máximo de 1000 caracteres.',
    briefingTooLong: 'Máximo de 2000 caracteres.',
    fallbackNumber: 'Indique el número al que pasar la llamada, en formato internacional.',
    emergencyNumber: 'Indique el número de urgencias en formato internacional, por ejemplo +34911234567.',
    emergencyTooLong: 'Máximo de 1000 caracteres.',
    afterHoursNumberRequired: 'Indique adónde va la llamada fuera de horario, aquí o en el número de urgencias.',
    operator: 'Elija la operadora actual.',
    areaRegion: 'Elija la provincia del número nuevo.',
    plan: 'Elija un plan.',
    terms: 'Hay que aceptar los términos para continuar.',
  },
}

function build(m: Messages) {
  const phone = z
    .string()
    .transform(normalisePhone)
    .refine((v) => E164.test(v), { error: m.phone })

  const time = z.string().regex(HHMM, { error: m.time })

  // Step 1: what it costs -----------------------------------------------------
  // The plan first, and not last, for two reasons. It is the only decision the
  // reader arrived having already half made, so it is the cheapest step to open
  // with; and it is what caps the languages on step 5, which used to be asked
  // before anything knew the ceiling.
  const step1 = z.object({
    plan_id: z.enum(SIGNUP_PLANS, { error: m.plan }),
    billing_cycle: z.enum(['monthly', 'annual']),
    addon_whatsapp: z.boolean().optional().default(false),
  })

  // Step 2: who is signing up -------------------------------------------------
  const step2 = z.object({
    clinic_name: z.string().trim().min(3, { error: m.nameShort }).max(120, { error: m.nameLong }),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: m.email })),
    phone,
    // The street address. Asked because it is the single most common question a
    // receptionist answers, and the form was not collecting it.
    address: z.string().trim().max(200, { error: m.addressLong }).optional().default(''),
    specialty: z.enum(SPECIALTIES, { error: m.specialty }),
    region: z.string().refine((v) => REGION_IDS.includes(v), { error: m.region }),
    locale: z.enum(['pt', 'es']).default(DEFAULT_ONBOARDING_LOCALE),
  })

  // Step 3: when the door is open ---------------------------------------------
  const dayHours = z
    .object({ closed: z.boolean(), open: time, close: time })
    .refine((d) => d.closed || d.open < d.close, { error: m.closeBeforeOpen, path: ['close'] })

  const step3 = z
    .object({
      weekdays: dayHours,
      saturday: dayHours,
      sunday: dayHours,
      pause: z
        .object({ enabled: z.boolean(), start: time, end: time })
        .refine((p) => !p.enabled || p.start < p.end, {
          error: m.pauseEndBeforeStart,
          path: ['end'],
        }),
      appointment_duration_minutes: z.coerce
        .number()
        .int()
        .min(5, { error: m.durationMin })
        .max(240, { error: m.durationMax }),
      min_interval_minutes: z.coerce
        .number()
        .int()
        .min(5, { error: m.intervalMin })
        .max(240, { error: m.intervalMax }),
    })
    .refine((s) => !s.weekdays.closed || !s.saturday.closed || !s.sunday.closed, {
      error: m.neverOpen,
      path: ['weekdays'],
    })

  // Step 4: what Telma may book, and what it costs -----------------------------
  const step4 = z.object({
    services: z
      .array(z.string())
      .min(1, { error: m.servicesMin })
      .refine((list) => list.every((id) => ALL_SERVICE_IDS.includes(id)), {
        error: m.servicesUnknown,
      }),
    custom_services: z.string().trim().max(500, { error: m.customTooLong }).optional().default(''),
    // { "<service id>": minutes }. Every key optional, and a service left out
    // takes the length from the hours step. Nobody is made to fill in a table
    // of numbers to sign up, which is the point: the clinics that need this
    // know they need it, and the rest must never meet it.
    service_durations: z
      .record(z.string(), z.coerce.number().int().min(5, { error: m.durationMin }).max(480, { error: m.durationMax }))
      .optional()
      .default({}),
    // Empty means Telma does not discuss prices, which is a real answer and the
    // prompt says so out loud rather than staying silent about it.
    price_info: z.string().trim().max(1000, { error: m.priceTooLong }).optional().default(''),
  })

  // Step 5: how Telma behaves --------------------------------------------------
  // Languages, voice, and the handful of things that turn a generic agent into
  // this clinic's receptionist. Language codes are not enumerated here: the list
  // lives in `available_languages`, and a schema that hardcoded it would need a
  // deploy to add German.
  const step5 = z
    .object({
      selected_languages: z
        .array(z.string())
        .min(1, { error: m.languageMin })
        .refine((v) => new Set(v).size === v.length, { error: m.duplicateLanguage }),
      greeting_language: z.string().min(1, { error: m.greetingLanguage }),
      formality: z.enum(['formal', 'informal']),
      fallback_policy: z.enum(['transfer', 'message', 'callback']),
      fallback_number: z.string().optional().default(''),
      briefing: z.string().trim().max(2000, { error: m.briefingTooLong }).optional().default(''),
      // Emergencies are their own path, not a flavour of `fallback_policy`.
      // Optional at the schema level and chased in the panel afterwards: a
      // clinic that leaves it blank still gets a safe instruction (send the
      // caller to an emergency service), and refusing the sign-up over it would
      // trade a real customer for a field.
      emergency_number: z.string().optional().default(''),
      emergency_protocol: z
        .string()
        .trim()
        .max(1000, { error: m.emergencyTooLong })
        .optional()
        .default(''),
      // Consent to be rung at night, and it starts off.
      //
      // Not a default anybody can drift into: a clinic that never answered this
      // question has not agreed to have somebody's phone ring at three in the
      // morning because a caller asked to speak to the doctor. Nothing here
      // forces a choice, because the safe answer is the one you get by saying
      // nothing.
      after_hours_transfer: z.coerce.boolean().optional().default(false),
      after_hours_number: z.string().optional().default(''),
      after_hours_patients_only: z.coerce.boolean().optional().default(true),
    })
    .refine((v) => v.selected_languages.includes(v.greeting_language), {
      error: m.greetingNotSelected,
      path: ['greeting_language'],
    })
    .refine(
      (v) => v.fallback_policy !== 'transfer' || E164.test(normalisePhone(v.fallback_number ?? '')),
      { error: m.fallbackNumber, path: ['fallback_number'] }
    )
    .refine(
      (v) => !v.emergency_number || E164.test(normalisePhone(v.emergency_number)),
      { error: m.emergencyNumber, path: ['emergency_number'] }
    )
    .refine(
      (v) => !v.after_hours_number || E164.test(normalisePhone(v.after_hours_number)),
      { error: m.emergencyNumber, path: ['after_hours_number'] }
    )
    // Saying yes to night calls without saying where they go would leave Telma
    // announcing a transfer she cannot make, which is the failure this whole
    // block exists to prevent.
    .refine(
      (v) => !v.after_hours_transfer || !!(v.after_hours_number || v.emergency_number),
      { error: m.afterHoursNumberRequired, path: ['after_hours_number'] }
    )

  // Step 6: the number, and the signature --------------------------------------
  const step6 = z.intersection(
    z.discriminatedUnion('phone_option', [
      z.object({
        phone_option: z.literal('keep'),
        current_number: phone,
        operator: z.enum(OPERATORS, { error: m.operator }),
      }),
      z.object({
        phone_option: z.literal('new'),
        area_region: z.string().refine((v) => REGION_IDS.includes(v), { error: m.areaRegion }),
      }),
    ]),
    z.object({ terms: z.literal(true, { error: m.terms }) })
  )

  return { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6 } as const
}

// Built once per language and kept. Rebuilding a dozen zod objects on every
// keystroke of every applicant is work nobody asked for.
const CACHE = new Map<OnboardingLocale, ReturnType<typeof build>>()

export function wizardSchemas(locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE) {
  const key = MESSAGES[locale] ? locale : DEFAULT_ONBOARDING_LOCALE
  let built = CACHE.get(key)
  if (!built) {
    built = build(MESSAGES[key])
    CACHE.set(key, built)
  }
  return built
}

/** The Portuguese set, for callers that have no reader to speak to. */
export const wizardStepSchemas = wizardSchemas(DEFAULT_ONBOARDING_LOCALE)

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6
export const STEP_NUMBERS: StepNumber[] = [1, 2, 3, 4, 5, 6]
export const LAST_STEP: StepNumber = 6

export function isStepNumber(n: unknown): n is StepNumber {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= LAST_STEP
}

type Schemas = ReturnType<typeof build>
export type Step1 = z.infer<Schemas[1]>
export type Step2 = z.infer<Schemas[2]>
export type Step3 = z.infer<Schemas[3]>
export type Step4 = z.infer<Schemas[4]>
export type Step5 = z.infer<Schemas[5]>
export type Step6 = z.infer<Schemas[6]>

/** Everything a completed sign-up knows. The union is flattened, not nested,
 *  because the draft is one merged object and the server writes one clinic. */
export type WizardData = Step1 & Step2 & Step3 & Step4 & Step5 & Step6

/**
 * zod issues, flattened to one message per field, in the shape a form wants.
 *
 * Only the first message per field survives, on purpose: a field with three
 * complaints under it reads as broken rather than as wrong, and the second
 * complaint is usually a consequence of the first.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form'
    if (!(key in out)) out[key] = issue.message
  }
  return out
}

/** Runs one step's schema and reports it the way the form and the API both want. */
export function validateStep(
  step: StepNumber,
  data: unknown,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): { ok: true; data: unknown } | { ok: false; errors: Record<string, string> } {
  const result = wizardSchemas(locale)[step].safeParse(data)
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, errors: fieldErrors(result.error) }
}

/**
 * The whole thing, re-checked at submit time.
 *
 * Not the same as trusting the six step checks: a draft is assembled over an
 * hour across two devices, and the only moment every answer exists together is
 * the moment we are about to charge for it. This is what stops a clinic being
 * created from a draft whose step 3 was written by an older version of the form.
 *
 * It re-runs the six step schemas over the merged draft rather than composing
 * one big schema out of their shapes. Composing would silently drop every
 * cross-field rule: `.refine()` lives on the schema, not on `.shape`, so
 * spreading the shapes produces an object that no longer knows a clinic has to
 * be open at least one day. Each object schema ignores the keys that are not
 * its own, so running all six over the same object is safe and complete.
 */
export function validateComplete(
  data: unknown,
  locale: OnboardingLocale = DEFAULT_ONBOARDING_LOCALE
): { ok: true; data: WizardData } | { ok: false; errors: Record<string, string> } {
  const schemas = wizardSchemas(locale)
  const merged: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  for (const step of STEP_NUMBERS) {
    const result = schemas[step].safeParse(data)
    if (result.success) Object.assign(merged, result.data)
    else Object.assign(errors, fieldErrors(result.error))
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, data: merged as WizardData }
}
