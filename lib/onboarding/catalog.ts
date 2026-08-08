import type { OnboardingLocale } from './locale'

/**
 * The lists the sign-up form offers, in one place.
 *
 * They are here rather than inside the components because three different
 * things need them and must agree: the form draws them, the zod schemas
 * validate against them, and the server writes them to the clinic. A service
 * that exists in the dropdown but not in the schema is a form that cannot be
 * submitted, and the only way to be sure that never happens is to have one
 * source for both.
 */

// Specialties ---------------------------------------------------------------
// Four, because these are the three verticals Telma is sold into plus an
// escape hatch. 'outra' is not a placeholder: a physiotherapy practice is a
// real customer, and it gets the generic service list and writes the rest in
// the free text field.
export const SPECIALTIES = ['dentaria', 'estetica', 'veterinaria', 'outra'] as const
export type Specialty = (typeof SPECIALTIES)[number]

// The ids stay Portuguese because they are stored, and a stored key that
// changes with the reader's language is a key that cannot be queried. Only the
// label moves.
const SPECIALTY_LABEL_BY_LOCALE: Record<OnboardingLocale, Record<Specialty, string>> = {
  pt: {
    dentaria: 'Clínica dentária',
    estetica: 'Medicina estética',
    veterinaria: 'Clínica veterinária',
    outra: 'Outra área',
  },
  es: {
    dentaria: 'Clínica dental',
    estetica: 'Medicina estética',
    veterinaria: 'Clínica veterinaria',
    outra: 'Otra área',
  },
}

export function specialtyLabel(id: Specialty, locale: OnboardingLocale): string {
  return (SPECIALTY_LABEL_BY_LOCALE[locale] ?? SPECIALTY_LABEL_BY_LOCALE.pt)[id] ?? id
}

/** Portuguese labels, for the places that write a record rather than a screen:
 *  the activity log and the internal panel, which are Portuguese by policy. */
export const SPECIALTY_LABEL: Record<Specialty, string> = SPECIALTY_LABEL_BY_LOCALE.pt

// Services ------------------------------------------------------------------
// What Telma is allowed to book, per specialty. This list is not decoration:
// the voice agent answers "do you do implants?" from it, and a wrong yes costs
// the clinic a patient who arrives for something nobody can do that day.
//
// The ids are stable, lowercase and specialty-prefixed so two specialties can
// both offer a "consulta" without the two becoming one row.
export interface ServiceOption {
  id: string
  label: string
}

/** Same rule as the specialties: the id is stored, only the label is read. */
const SERVICE_LABEL_ES: Record<string, string> = {
  dent_consulta: 'Consulta de valoración',
  dent_limpeza: 'Limpieza / tartrectomía',
  dent_branqueamento: 'Blanqueamiento',
  dent_implantes: 'Implantes',
  dent_ortodontia: 'Ortodoncia',
  dent_endodontia: 'Endodoncia',
  dent_proteses: 'Prótesis',
  dent_extracao: 'Extracción',
  dent_urgencia: 'Urgencia',
  est_consulta: 'Consulta de valoración',
  est_botox: 'Toxina botulínica',
  est_acido: 'Ácido hialurónico',
  est_lifting: 'Lifting',
  est_peeling: 'Peeling químico',
  est_laser: 'Depilación láser',
  est_mesoterapia: 'Mesoterapia',
  est_criolipolise: 'Criolipólisis',
  vet_consulta: 'Consulta general',
  vet_vacinacao: 'Vacunación',
  vet_desparasitacao: 'Desparasitación',
  vet_cirurgia: 'Cirugía',
  vet_analises: 'Analíticas',
  vet_imagem: 'Ecografía / radiografía',
  vet_estetica: 'Peluquería canina',
  vet_urgencia: 'Urgencia',
  gen_consulta: 'Primera consulta',
  gen_seguimento: 'Consulta de seguimiento',
  gen_tratamento: 'Sesión de tratamiento',
  gen_avaliacao: 'Valoración',
  gen_urgencia: 'Urgencia',
}

export const SERVICES: Record<Specialty, ServiceOption[]> = {
  dentaria: [
    { id: 'dent_consulta', label: 'Consulta de avaliação' },
    { id: 'dent_limpeza', label: 'Limpeza / destartarização' },
    { id: 'dent_branqueamento', label: 'Branqueamento' },
    { id: 'dent_implantes', label: 'Implantes' },
    { id: 'dent_ortodontia', label: 'Ortodontia' },
    { id: 'dent_endodontia', label: 'Endodontia' },
    { id: 'dent_proteses', label: 'Próteses' },
    { id: 'dent_extracao', label: 'Extração' },
    { id: 'dent_urgencia', label: 'Urgência' },
  ],
  estetica: [
    { id: 'est_consulta', label: 'Consulta de avaliação' },
    { id: 'est_botox', label: 'Toxina botulínica' },
    { id: 'est_acido', label: 'Ácido hialurónico' },
    { id: 'est_lifting', label: 'Lifting' },
    { id: 'est_peeling', label: 'Peeling químico' },
    { id: 'est_laser', label: 'Depilação laser' },
    { id: 'est_mesoterapia', label: 'Mesoterapia' },
    { id: 'est_criolipolise', label: 'Criolipólise' },
  ],
  veterinaria: [
    { id: 'vet_consulta', label: 'Consulta geral' },
    { id: 'vet_vacinacao', label: 'Vacinação' },
    { id: 'vet_desparasitacao', label: 'Desparasitação' },
    { id: 'vet_cirurgia', label: 'Cirurgia' },
    { id: 'vet_analises', label: 'Análises' },
    { id: 'vet_imagem', label: 'Ecografia / raio-x' },
    { id: 'vet_estetica', label: 'Banho e tosquia' },
    { id: 'vet_urgencia', label: 'Urgência' },
  ],
  outra: [
    { id: 'gen_consulta', label: 'Primeira consulta' },
    { id: 'gen_seguimento', label: 'Consulta de seguimento' },
    { id: 'gen_tratamento', label: 'Sessão de tratamento' },
    { id: 'gen_avaliacao', label: 'Avaliação' },
    { id: 'gen_urgencia', label: 'Urgência' },
  ],
}

/** Every service id that exists, for validating a submitted selection. */
export const ALL_SERVICE_IDS: string[] = Object.values(SERVICES).flatMap((list) =>
  list.map((s) => s.id)
)

export function serviceLabel(id: string, locale: OnboardingLocale = 'pt'): string {
  if (locale === 'es' && SERVICE_LABEL_ES[id]) return SERVICE_LABEL_ES[id]
  for (const list of Object.values(SERVICES)) {
    const found = list.find((s) => s.id === id)
    if (found) return found.label
  }
  return id
}

/** The list a step draws, already in the reader's language. */
export function servicesFor(specialty: Specialty, locale: OnboardingLocale): ServiceOption[] {
  const list = SERVICES[specialty] ?? SERVICES.outra
  if (locale !== 'es') return list
  return list.map((s) => ({ id: s.id, label: SERVICE_LABEL_ES[s.id] ?? s.label }))
}

// Countries -----------------------------------------------------------------
// Telma is sold in Portugal and in Spain. The two differ in more than language:
// different area codes, different operators to port from, different Twilio
// inventory, and a different clock. Madrid is an hour ahead of Lisbon, and the
// clinic's own timezone is what decides where its day starts on the agenda, so
// getting this wrong shows up as appointments landing on the wrong side of
// midnight rather than as anything obviously about a country.
export const COUNTRIES = ['PT', 'ES'] as const
export type Country = (typeof COUNTRIES)[number]

export const COUNTRY_LABEL: Record<OnboardingLocale, Record<Country, string>> = {
  pt: { PT: 'Portugal', ES: 'Espanha' },
  es: { PT: 'Portugal', ES: 'España' },
}

export const DIAL_CODE: Record<Country, string> = { PT: '+351', ES: '+34' }

/** IANA zones. Written to `clinics.timezone`, which every agenda query reads. */
export const TIMEZONE: Record<Country, string> = {
  PT: 'Europe/Lisbon',
  ES: 'Europe/Madrid',
}

/** How many digits a national number has after the dial code. Used to build a
 *  demo number that is the right shape, and to write the placeholder. */
export const NATIONAL_DIGITS: Record<Country, number> = { PT: 9, ES: 9 }

export const PHONE_EXAMPLE: Record<Country, string> = {
  PT: '+351 21 123 4567',
  ES: '+34 91 123 45 67',
}

// Regions ---------------------------------------------------------------------
// Portugal's eighteen districts plus the two autonomous regions, and Spain's
// fifty provinces plus Ceuta and Melilla. The area code is why this list exists:
// a clinic in Málaga given a Madrid number looks to its patients like a call
// centre, which is exactly the impression Telma is sold to avoid.
//
// The ids are unique across both countries, which is not an accident. It means a
// region identifies its own country, so nothing downstream has to carry the two
// together or check that they agree: `countryOfRegion()` is the only lookup, and
// a region and a country cannot drift out of step because there is only one of
// them stored.
export interface Region {
  id: string
  label: string
  areaCode: string
  country: Country
}

export const REGIONS: Region[] = [
  // Portugal
  { id: 'aveiro', label: 'Aveiro', areaCode: '234', country: 'PT' },
  { id: 'beja', label: 'Beja', areaCode: '284', country: 'PT' },
  { id: 'braga', label: 'Braga', areaCode: '253', country: 'PT' },
  { id: 'braganca', label: 'Bragança', areaCode: '273', country: 'PT' },
  { id: 'castelo-branco', label: 'Castelo Branco', areaCode: '272', country: 'PT' },
  { id: 'coimbra', label: 'Coimbra', areaCode: '239', country: 'PT' },
  { id: 'evora', label: 'Évora', areaCode: '266', country: 'PT' },
  { id: 'faro', label: 'Faro', areaCode: '289', country: 'PT' },
  { id: 'guarda', label: 'Guarda', areaCode: '271', country: 'PT' },
  { id: 'leiria', label: 'Leiria', areaCode: '244', country: 'PT' },
  { id: 'lisboa', label: 'Lisboa', areaCode: '21', country: 'PT' },
  { id: 'portalegre', label: 'Portalegre', areaCode: '245', country: 'PT' },
  { id: 'porto', label: 'Porto', areaCode: '22', country: 'PT' },
  { id: 'santarem', label: 'Santarém', areaCode: '243', country: 'PT' },
  { id: 'setubal', label: 'Setúbal', areaCode: '265', country: 'PT' },
  { id: 'viana-do-castelo', label: 'Viana do Castelo', areaCode: '258', country: 'PT' },
  { id: 'vila-real', label: 'Vila Real', areaCode: '259', country: 'PT' },
  { id: 'viseu', label: 'Viseu', areaCode: '232', country: 'PT' },
  { id: 'acores', label: 'Açores', areaCode: '295', country: 'PT' },
  { id: 'madeira', label: 'Madeira', areaCode: '291', country: 'PT' },

  // España
  { id: 'es-a-coruna', label: 'A Coruña', areaCode: '981', country: 'ES' },
  { id: 'es-alava', label: 'Álava', areaCode: '945', country: 'ES' },
  { id: 'es-albacete', label: 'Albacete', areaCode: '967', country: 'ES' },
  { id: 'es-alicante', label: 'Alicante', areaCode: '965', country: 'ES' },
  { id: 'es-almeria', label: 'Almería', areaCode: '950', country: 'ES' },
  { id: 'es-asturias', label: 'Asturias', areaCode: '985', country: 'ES' },
  { id: 'es-avila', label: 'Ávila', areaCode: '920', country: 'ES' },
  { id: 'es-badajoz', label: 'Badajoz', areaCode: '924', country: 'ES' },
  { id: 'es-baleares', label: 'Illes Balears', areaCode: '971', country: 'ES' },
  { id: 'es-barcelona', label: 'Barcelona', areaCode: '93', country: 'ES' },
  { id: 'es-burgos', label: 'Burgos', areaCode: '947', country: 'ES' },
  { id: 'es-caceres', label: 'Cáceres', areaCode: '927', country: 'ES' },
  { id: 'es-cadiz', label: 'Cádiz', areaCode: '956', country: 'ES' },
  { id: 'es-cantabria', label: 'Cantabria', areaCode: '942', country: 'ES' },
  { id: 'es-castellon', label: 'Castellón', areaCode: '964', country: 'ES' },
  { id: 'es-ceuta', label: 'Ceuta', areaCode: '956', country: 'ES' },
  { id: 'es-ciudad-real', label: 'Ciudad Real', areaCode: '926', country: 'ES' },
  { id: 'es-cordoba', label: 'Córdoba', areaCode: '957', country: 'ES' },
  { id: 'es-cuenca', label: 'Cuenca', areaCode: '969', country: 'ES' },
  { id: 'es-girona', label: 'Girona', areaCode: '972', country: 'ES' },
  { id: 'es-granada', label: 'Granada', areaCode: '958', country: 'ES' },
  { id: 'es-guadalajara', label: 'Guadalajara', areaCode: '949', country: 'ES' },
  { id: 'es-guipuzcoa', label: 'Gipuzkoa', areaCode: '943', country: 'ES' },
  { id: 'es-huelva', label: 'Huelva', areaCode: '959', country: 'ES' },
  { id: 'es-huesca', label: 'Huesca', areaCode: '974', country: 'ES' },
  { id: 'es-jaen', label: 'Jaén', areaCode: '953', country: 'ES' },
  { id: 'es-la-rioja', label: 'La Rioja', areaCode: '941', country: 'ES' },
  { id: 'es-las-palmas', label: 'Las Palmas', areaCode: '928', country: 'ES' },
  { id: 'es-leon', label: 'León', areaCode: '987', country: 'ES' },
  { id: 'es-lleida', label: 'Lleida', areaCode: '973', country: 'ES' },
  { id: 'es-lugo', label: 'Lugo', areaCode: '982', country: 'ES' },
  { id: 'es-madrid', label: 'Madrid', areaCode: '91', country: 'ES' },
  { id: 'es-malaga', label: 'Málaga', areaCode: '952', country: 'ES' },
  { id: 'es-melilla', label: 'Melilla', areaCode: '952', country: 'ES' },
  { id: 'es-murcia', label: 'Murcia', areaCode: '968', country: 'ES' },
  { id: 'es-navarra', label: 'Navarra', areaCode: '948', country: 'ES' },
  { id: 'es-ourense', label: 'Ourense', areaCode: '988', country: 'ES' },
  { id: 'es-palencia', label: 'Palencia', areaCode: '979', country: 'ES' },
  { id: 'es-pontevedra', label: 'Pontevedra', areaCode: '986', country: 'ES' },
  { id: 'es-salamanca', label: 'Salamanca', areaCode: '923', country: 'ES' },
  { id: 'es-tenerife', label: 'Santa Cruz de Tenerife', areaCode: '922', country: 'ES' },
  { id: 'es-segovia', label: 'Segovia', areaCode: '921', country: 'ES' },
  { id: 'es-sevilla', label: 'Sevilla', areaCode: '954', country: 'ES' },
  { id: 'es-soria', label: 'Soria', areaCode: '975', country: 'ES' },
  { id: 'es-tarragona', label: 'Tarragona', areaCode: '977', country: 'ES' },
  { id: 'es-teruel', label: 'Teruel', areaCode: '978', country: 'ES' },
  { id: 'es-toledo', label: 'Toledo', areaCode: '925', country: 'ES' },
  { id: 'es-valencia', label: 'València', areaCode: '963', country: 'ES' },
  { id: 'es-valladolid', label: 'Valladolid', areaCode: '983', country: 'ES' },
  { id: 'es-vizcaya', label: 'Bizkaia', areaCode: '944', country: 'ES' },
  { id: 'es-zamora', label: 'Zamora', areaCode: '980', country: 'ES' },
  { id: 'es-zaragoza', label: 'Zaragoza', areaCode: '976', country: 'ES' },
]

export const REGION_IDS: string[] = REGIONS.map((r) => r.id)

export function regionsFor(country: Country): Region[] {
  return REGIONS.filter((r) => r.country === country)
}

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id)
}

export function regionLabel(id: string): string {
  return regionById(id)?.label ?? id
}

/** The country a region belongs to. Portugal when the id is unknown, which is
 *  the only guess that is wrong in a way somebody notices and corrects. */
export function countryOfRegion(id: string): Country {
  return regionById(id)?.country ?? 'PT'
}

export function areaCodeFor(id: string): string {
  return regionById(id)?.areaCode ?? '21'
}

// Operators -------------------------------------------------------------------
// Who the clinic's existing number is with, when they want to keep it. Porting
// is a conversation with that operator, and knowing which one it is before the
// call is half the work. Different market, different list.
export const OPERATORS_BY_COUNTRY: Record<Country, readonly string[]> = {
  PT: ['MEO', 'NOS', 'Vodafone', 'NOWO', 'Onitelecom', 'Outra'],
  ES: ['Movistar', 'Vodafone', 'Orange', 'Yoigo', 'MásMóvil', 'Digi', 'Otra'],
}

/** Every operator name that may legitimately arrive, for validation. */
export const OPERATORS = [
  ...OPERATORS_BY_COUNTRY.PT,
  ...OPERATORS_BY_COUNTRY.ES,
] as [string, ...string[]]

// Plans on offer at sign-up -------------------------------------------------
// 'personalizado' is deliberately absent: it has no price, so it cannot be
// bought from a form. That path is a conversation, and the wizard says so.
export const SIGNUP_PLANS = ['essencial', 'clinica', 'rede'] as const
export type SignupPlan = (typeof SIGNUP_PLANS)[number]
