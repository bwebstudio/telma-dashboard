import type {
  Clinic,
  AppUser,
  AvailabilitySlot,
  BlockedDay,
  Appointment,
  Call,
  Usage,
  ActivityEvent,
  Patient,
  PatientNote,
  PatientRecall,
  Purchase,
  UserRole,
} from '@/lib/types'
import type { DemoStage } from './config'
import { demoAppointments, demoConversations } from './clinic'
import type {
  CrmActivity,
  CrmContact,
  CrmProspect,
  CrmRep,
} from '@/lib/crm/types'

export const DEMO_CLINIC_ID = 'demo-clinic-1'
const CLINIC_2 = 'demo-clinic-2'
export const DEMO_REP_PT = 'demo-rep-pt'
export const DEMO_REP_ES = 'demo-rep-es'

const now = new Date()
const iso = (offsetMinutes: number) =>
  new Date(now.getTime() + offsetMinutes * 60_000).toISOString()
const atToday = (h: number, m = 0) => {
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const inDays = (days: number, h: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}
// Demo only. The mock day below is written in whole local hours, so the panel
// formats it in the machine's own zone and 11:00 stays 11:00. A real clinic
// carries its own zone in the database.
const demoTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon'
const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
const pad = (n: number) => String(n).padStart(2, '0')

// Mutable store. Actions in demo mode mutate this in memory (dev only).
export interface DemoStore {
  clinics: Clinic[]
  users: (AppUser & { password?: string })[]
  availability_slots: AvailabilitySlot[]
  blocked_days: BlockedDay[]
  appointments: Appointment[]
  calls: Call[]
  usage: Usage[]
  activity_log: ActivityEvent[]
  /** The people. Missing until now, and the patients screen reads it first:
   *  the query threw, the page caught it and drew "something went wrong", so
   *  the demo had a broken screen in the middle of the sidebar. */
  patients: Patient[]
  /** Several per person, newest first: the record stopped having one note
   *  that each new one overwrote. See 0071. */
  patient_notes: PatientNote[]
  /** With the patient already attached. The screen reads it from a join, and
   *  the demo's stand-in for Supabase does not join, so the row carries what
   *  the join would have brought. */
  patient_recalls: Array<PatientRecall & { patients?: { id: string; name: string } }>
  /** What the clinic has been charged. The real table is read on the account
   *  screen; without it here that screen says "no purchases yet" to somebody
   *  being shown the product, which reads as a feature that does not work. */
  purchases: Purchase[]
  // Sales CRM. Separate tables from the client ones on purpose.
  crm_reps: CrmRep[]
  crm_prospects: CrmProspect[]
  crm_contacts: CrmContact[]
  crm_activities: CrmActivity[]
}

function seedSlots(clinicId: string): AvailabilitySlot[] {
  const days = [1, 2, 3, 4, 5]
  const hours = [9, 10, 11, 14, 15, 16]
  return days.flatMap((weekday) =>
    hours.map((h) => ({
      id: `slot-${clinicId}-${weekday}-${h}`,
      clinic_id: clinicId,
      weekday,
      start_time: `${pad(h)}:00:00`,
      end_time: `${pad(h + 1)}:00:00`,
      capacity: 1,
      active: true,
    }))
  )
}

// Keeps the seed rows readable: fills in every column a real crm_prospects row
// has, including the phone_digits that Postgres generates for us in production.
function prospect(p: Partial<CrmProspect> & { id: string; name: string }): CrmProspect {
  return {
    specialty: 'other',
    country: 'PT',
    zone: null,
    address: null,
    phone: null,
    website: null,
    lat: null,
    lon: null,
    origin: 'cold',
    origin_note: null,
    rep_id: null,
    stage: 'new',
    next_action_text: null,
    next_action_at: null,
    last_activity_at: null,
    conversion_requested_at: null,
    converted_clinic_id: null,
    converted_at: null,
    created_by: null,
    created_at: iso(-60 * 24 * 10),
    updated_at: iso(-60),
    phone_digits: (p.phone ?? '').replace(/\D/g, ''),
    ...p,
  }
}

const seed: DemoStore = {
  clinics: [
    {
      id: DEMO_CLINIC_ID,
      name: 'Clínica Dentária Sorriso',
      address: 'Rua das Flores 12, Porto',
      phone: '+351 220 000 000',
      contact_email: 'geral@sorriso.pt',
      // ── WHAT THE SIGN-UP WRITES ──────────────────────────────────────
      // Not decoration. The set-up wizard saves the services step through
      // the sign-up's own schemas, which validate the whole profile and not
      // only the fields on screen, so a demo clinic without a specialty or a
      // district could tick every service and never get past step 2 -- with
      // nothing on screen to say why, because the error belongs to a field
      // that step does not draw.
      specialty: 'dentaria',
      region: 'porto',
      language: 'pt',
      selected_languages: ['pt'],
      plan: 'clinica',
      addon_whatsapp: true,
      status: 'ativa',
      minute_limit: 750,
      assigned_phone: '+351 300 500 900',
      phone_source: 'provisioned',
      phone_provider_ref: 'PN01demoLineThatAnswers',
      porting_details: null,
      voice_agent_id: 'agent_sorriso_01',
      voice_name: 'Telma PT',
      timezone: demoTimezone,
      logo_url: null,
      accent: 'brand',
      pre_appointment_auto_expires: true,
      // The screen prints "next renewal" and had nothing to print.
      plan_renews_at: iso(60 * 24 * 20),
      created_at: iso(-60 * 24 * 40),
      updated_at: iso(-60),
    },
    {
      id: CLINIC_2,
      name: 'Estética Luz',
      address: 'Avenida Central 88, Lisboa',
      phone: '+351 210 111 222',
      contact_email: 'ola@esteticaluz.pt',
      specialty: 'estetica',
      region: 'lisboa',
      language: 'pt',
      selected_languages: ['pt'],
      plan: 'essencial',
      addon_whatsapp: false,
      status: 'ativa',
      minute_limit: 250,
      assigned_phone: '+351 300 700 100',
      phone_source: 'provisioned',
      phone_provider_ref: 'PN02demoLineThatAnswers',
      porting_details: null,
      voice_agent_id: 'agent_luz_01',
      voice_name: 'Telma PT',
      timezone: demoTimezone,
      logo_url: null,
      accent: 'brand',
      pre_appointment_auto_expires: true,
      created_at: iso(-60 * 24 * 20),
      updated_at: iso(-120),
    },
  ],
  users: [
    {
      id: 'demo-user-clinica',
      email: 'rececao@sorriso.pt',
      full_name: 'Receção Sorriso',
      role: 'clinica',
      clinic_id: DEMO_CLINIC_ID,
      locale: 'pt',
      welcomed_at: '2026-01-01T00:00:00Z',
      clinic: null,
    },
    {
      id: 'demo-user-interno',
      email: 'info@bwebstudio.com',
      full_name: 'Bweb Studio',
      role: 'interno',
      clinic_id: null,
      locale: 'pt',
      welcomed_at: '2026-01-01T00:00:00Z',
      clinic: null,
    },
    {
      id: DEMO_REP_PT,
      email: 'domingos@telma.pt',
      full_name: 'Domingos',
      role: 'comercial',
      clinic_id: null,
      locale: 'pt',
      welcomed_at: '2026-01-01T00:00:00Z',
      clinic: null,
    },
  ],
  availability_slots: [...seedSlots(DEMO_CLINIC_ID), ...seedSlots(CLINIC_2)],
  blocked_days: [
    { id: 'block-1', clinic_id: DEMO_CLINIC_ID, day: inDays(9, 0).slice(0, 10), reason: 'Feriado' },
  ],
  appointments: [
    // The demo clinic's own day lives in lib/demo/clinic.ts: it is the data
    // the clinic panel is designed around, and it is long enough to deserve
    // its own file. The second clinic keeps one row so the internal panel
    // shows more than one name.
    ...demoAppointments(DEMO_CLINIC_ID),
    {
      id: 'appt-4',
      clinic_id: CLINIC_2,
      call_id: null,
      patient_name: 'Miguel Costa',
      patient_phone: '+351 911 222 333',
      reason: 'Depilação',
      scheduled_at: inDays(2, 16),
      status: 'pendente',
      origin: 'telefone',
      summary: 'Primeira sessão.',
      reject_reason: null,
      decided_at: null,
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      cancel_seen_at: null,
      created_at: iso(-200),
    },
  ],
  calls: [
    ...demoConversations(DEMO_CLINIC_ID),
    {
      id: 'call-5',
      clinic_id: CLINIC_2,
      channel: 'telefone',
      from_phone: '+351 915 555 444',
      patient_name: null,
      duration_seconds: 60,
      result: 'nao_resolvida',
      summary: 'A paciente desligou antes de terminar.',
      transcript: null,
      recording_url: null,
      created_at: iso(-60 * 3),
    },
  ],
  usage: [
    // Around two and a half minutes a call, which is what a booking really
    // takes. The second clinic sits past 80% of its plan so the demo shows the
    // near limit warning.
    { id: 'usage-1', clinic_id: DEMO_CLINIC_ID, month: monthKey, calls_count: 205, minutes: 520.5 },
    { id: 'usage-2', clinic_id: CLINIC_2, month: monthKey, calls_count: 84, minutes: 213.5 },
  ],
  // ── AS PESSOAS ──────────────────────────────────────────────────────────
  // The same names the diary already carries, so opening a booking and opening
  // a record lead to the same person. The note on a record is the clinic's
  // own and is the one field Telma is never given.
  patients: [
    {
      id: 'demo-patient-1',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Ana Martins',
      phone: '+351 912 345 678',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'ana martins',
      notes: 'Vem desde 2019. Prefere a Dra. Sofia.',
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 3),
      created_at: iso(-60 * 24 * 63),
    },
    {
      id: 'demo-patient-2',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Carlos Nunes',
      phone: '+351 913 887 220',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'carlos nunes',
      notes: null,
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 9),
      created_at: iso(-60 * 24 * 69),
    },
    {
      id: 'demo-patient-3',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Sofia Ramos',
      phone: '+351 917 004 115',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'sofia ramos',
      notes: 'Pede sempre a primeira hora da manhã.',
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 12),
      created_at: iso(-60 * 24 * 72),
    },
    {
      id: 'demo-patient-4',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Hélder Braga',
      phone: '+351 918 220 441',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'hélder braga',
      notes: null,
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 20),
      created_at: iso(-60 * 24 * 80),
    },
    {
      id: 'demo-patient-5',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Marta Lopes',
      phone: '+351 915 663 902',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'marta lopes',
      notes: null,
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 27),
      created_at: iso(-60 * 24 * 87),
    },
    {
      id: 'demo-patient-6',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Tiago Ferreira',
      phone: '+351 911 448 073',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'tiago ferreira',
      notes: 'Primeira consulta marcada pela Telma.',
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 34),
      created_at: iso(-60 * 24 * 94),
    },
    {
      id: 'demo-patient-7',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Beatriz Nogueira',
      phone: '+351 916 775 318',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'beatriz nogueira',
      notes: null,
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 41),
      created_at: iso(-60 * 24 * 101),
    },
    {
      id: 'demo-patient-8',
      clinic_id: DEMO_CLINIC_ID,
      name: 'Inês Cardoso',
      phone: '+351 914 092 657',
      other_digits: null,
      tax_id: null,
      tax_key: null,
      name_key: 'inês cardoso',
      notes: null,
      reminders_opt_out_at: null,
      marketing_consent_at: null,
      marketing_consent_source: null,
      last_seen_at: iso(-60 * 24 * 55),
      created_at: iso(-60 * 24 * 115),
    },
  ],

  // Three on one person, months apart, which is the whole point of the change:
  // in one field these would have been one paragraph with no dates, or only
  // the last of them.
  patient_notes: [
    {
      id: 'demo-note-1',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-1',
      body: 'Vem desde 2019. Prefere marcar de manhã e pede sempre a Dra. Sofia.',
      created_at: iso(-60 * 24 * 300),
    },
    {
      id: 'demo-note-2',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-1',
      body: 'Mudou de número em Março. O antigo já não atende.',
      created_at: iso(-60 * 24 * 120),
    },
    {
      id: 'demo-note-3',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-1',
      body: 'Ficou de trazer o relatório do ortopedista na próxima consulta.',
      created_at: iso(-60 * 24 * 9),
    },
    {
      id: 'demo-note-4',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-3',
      body: 'Fica nervosa no gabinete. Avisar a assistente antes de a chamar.',
      created_at: iso(-60 * 24 * 40),
    },
  ],

  // Two reminders due, which is what makes the queue at the top of the screen
  // worth drawing at all.
  patient_recalls: [
    {
      id: 'demo-recall-1',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-2',
      patients: { id: 'demo-patient-2', name: 'Carlos Nunes' },
      kind: 'aviso',
      due_on: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
      state: 'agendado',
      note: null,
      error: null,
      created_at: iso(-60 * 24 * 30),
    },
    {
      id: 'demo-recall-2',
      clinic_id: DEMO_CLINIC_ID,
      patient_id: 'demo-patient-5',
      patients: { id: 'demo-patient-5', name: 'Marta Lopes' },
      kind: 'aviso',
      due_on: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
      state: 'agendado',
      note: 'Pediu para ligarmos de manhã.',
      error: null,
      created_at: iso(-60 * 24 * 20),
    },
  ],

  // ── WHAT THIS CLINIC HAS PAID ───────────────────────────────────────────
  // Forty days of a real account: two months of the plan, the WhatsApp extra
  // the clinic has switched on, and a pack of minutes bought in a busy week.
  // The first month carries the welcome discount, because a line with a
  // discount under it is the one worth seeing before sending a real invoice.
  //
  // Every line is `completed`. A failed charge is a state this table draws and
  // it is not one to put in front of somebody being shown the product.
  purchases: [
    {
      id: 'demo-purchase-4',
      clinic_id: DEMO_CLINIC_ID,
      purchase_type: 'minute_pack',
      item_id: 'pack_100',
      item_name: 'Pacote de 100 minutos',
      quantity: 1,
      unit_price_eur: 29,
      total_price_eur: 29,
      coupon_code: null,
      discount_eur: 0,
      discount_percent: 0,
      final_price_eur: 29,
      payment_method: 'Visa ****4242',
      payment_status: 'completed',
      stripe_invoice_id: 'in_demo000000004',
      stripe_charge_id: 'ch_demo000000004',
      purchased_at: iso(-60 * 24 * 6),
      expires_at: null,
      created_at: iso(-60 * 24 * 6),
      updated_at: iso(-60 * 24 * 6),
    },
    {
      id: 'demo-purchase-3',
      clinic_id: DEMO_CLINIC_ID,
      purchase_type: 'plan_upgrade',
      item_id: 'clinica',
      item_name: 'Plano Clínica',
      quantity: 1,
      unit_price_eur: 249,
      total_price_eur: 249,
      coupon_code: null,
      discount_eur: 0,
      discount_percent: 0,
      final_price_eur: 249,
      payment_method: 'Visa ****4242',
      payment_status: 'completed',
      stripe_invoice_id: 'in_demo000000003',
      stripe_charge_id: 'ch_demo000000003',
      purchased_at: iso(-60 * 24 * 10),
      expires_at: null,
      created_at: iso(-60 * 24 * 10),
      updated_at: iso(-60 * 24 * 10),
    },
    {
      id: 'demo-purchase-2',
      clinic_id: DEMO_CLINIC_ID,
      purchase_type: 'addon',
      item_id: 'whatsapp',
      item_name: 'WhatsApp',
      quantity: 1,
      unit_price_eur: 19,
      total_price_eur: 19,
      coupon_code: null,
      discount_eur: 0,
      discount_percent: 0,
      final_price_eur: 19,
      payment_method: 'Visa ****4242',
      payment_status: 'completed',
      stripe_invoice_id: 'in_demo000000002',
      stripe_charge_id: 'ch_demo000000002',
      purchased_at: iso(-60 * 24 * 10),
      expires_at: null,
      created_at: iso(-60 * 24 * 10),
      updated_at: iso(-60 * 24 * 10),
    },
    {
      id: 'demo-purchase-1',
      clinic_id: DEMO_CLINIC_ID,
      purchase_type: 'plan_upgrade',
      item_id: 'clinica',
      item_name: 'Plano Clínica',
      quantity: 1,
      unit_price_eur: 249,
      total_price_eur: 249,
      coupon_code: 'BEMVINDO15',
      discount_eur: 37.35,
      discount_percent: 15,
      final_price_eur: 211.65,
      payment_method: 'Visa ****4242',
      payment_status: 'completed',
      stripe_invoice_id: 'in_demo000000001',
      stripe_charge_id: 'ch_demo000000001',
      purchased_at: iso(-60 * 24 * 40),
      expires_at: null,
      created_at: iso(-60 * 24 * 40),
      updated_at: iso(-60 * 24 * 40),
    },
  ],
  activity_log: [
    { id: 'act-1', clinic_id: DEMO_CLINIC_ID, type: 'call_received', message: 'A Telma atendeu uma chamada', created_at: atToday(11, 20) },
    { id: 'act-2', clinic_id: DEMO_CLINIC_ID, type: 'appointment_created', message: 'A Telma deixou uma pré-marcação para Ana Martins', created_at: atToday(9, 12) },
    { id: 'act-3', clinic_id: CLINIC_2, type: 'limit_warning', message: 'A clínica passou 80% do limite de chamadas (214/250)', created_at: iso(-60 * 4) },
    { id: 'act-4', clinic_id: CLINIC_2, type: 'call_received', message: 'A Telma atendeu uma chamada', created_at: iso(-60 * 3) },
  ],
  crm_reps: [
    {
      id: DEMO_REP_PT,
      full_name: 'Domingos',
      email: 'domingos@telma.pt',
      country: 'PT',
      territory: 'Grande Lisboa',
      role: 'comercial',
      active: true,
      created_at: iso(-60 * 24 * 90),
    },
    {
      id: DEMO_REP_ES,
      full_name: 'Sonia',
      email: 'sonia@telma.es',
      country: 'ES',
      territory: 'Madrid',
      role: 'comercial',
      active: true,
      created_at: iso(-60 * 24 * 20),
    },
  ],
  // Notes written the way the reps actually write them on WhatsApp today.
  crm_prospects: [
    prospect({
      id: 'demo-prospect-1',
      name: 'MP Aesthetic Clinic',
      specialty: 'aesthetic',
      zone: 'Lisboa',
      phone: '+351 213 456 789',
      rep_id: DEMO_REP_PT,
      stage: 'attempting',
      next_action_text: 'Está em horário de almoço. Ligar às 15h',
      next_action_at: atToday(15, 0),
      last_activity_at: atToday(13, 7),
    }),
    prospect({
      id: 'demo-prospect-2',
      name: 'All Family Dental Clinic',
      specialty: 'dental',
      zone: 'Algés',
      phone: '912 345 678',
      rep_id: DEMO_REP_PT,
      stage: 'attempting',
      next_action_text: 'A recepcionista Ana diz que aí talvez tenhamos sorte',
      next_action_at: atToday(14, 30),
      last_activity_at: iso(-60 * 26),
    }),
    prospect({
      id: 'demo-prospect-3',
      name: 'Clínica Dr Tomás Rebelo Pinto',
      specialty: 'dental',
      zone: 'Cascais',
      phone: '+351 214 000 111',
      rep_id: DEMO_REP_PT,
      stage: 'attempting',
      next_action_text: 'De férias até dia 3. Ligar a partir das 10h',
      next_action_at: iso(-60 * 5),
      last_activity_at: iso(-60 * 30),
    }),
    prospect({
      id: 'demo-prospect-4',
      name: 'Sorriso Branco',
      specialty: 'dental',
      zone: 'Oeiras',
      phone: '+351 214 555 222',
      rep_id: DEMO_REP_PT,
      stage: 'interested',
      origin: 'referral',
      origin_note: 'Mónica, Colgate',
      next_action_text: 'Quer proposta por email',
      next_action_at: inDays(1, 9),
      last_activity_at: iso(-60 * 4),
    }),
    prospect({
      id: 'demo-prospect-5',
      name: 'Clínica Dental Chamberí',
      specialty: 'dental',
      country: 'ES',
      zone: 'Madrid',
      phone: '+34 910 000 111',
      rep_id: DEMO_REP_ES,
      stage: 'meeting',
      next_action_text: 'Reunión con la Dra. Ruiz',
      next_action_at: inDays(2, 11),
      last_activity_at: iso(-60 * 20),
    }),
    prospect({
      id: 'demo-prospect-6',
      name: 'Estética Nova Luz',
      specialty: 'aesthetic',
      zone: 'Amadora',
      phone: '+351 214 777 333',
      rep_id: null,
      stage: 'new',
      last_activity_at: null,
    }),
    prospect({
      id: 'demo-prospect-7',
      name: 'Clínica Dentária Bem-Estar',
      specialty: 'dental',
      zone: 'Sintra',
      phone: '+351 219 111 444',
      rep_id: DEMO_REP_PT,
      stage: 'attempting',
      last_activity_at: iso(-60 * 72),
    }),
  ],
  crm_contacts: [
    {
      id: 'demo-crm-contact-1',
      prospect_id: 'demo-prospect-2',
      name: 'Dra Maria Baptista Fernandes',
      role: 'doctor',
      phone: null,
      notes: 'Ligar às 12h50, é quando está entre consultas',
      created_at: iso(-60 * 48),
    },
    {
      id: 'demo-crm-contact-2',
      prospect_id: 'demo-prospect-2',
      name: 'Ana',
      role: 'reception',
      phone: null,
      notes: 'Simpática, disse para tentarmos às 14h30',
      created_at: iso(-60 * 27),
    },
  ],
  crm_activities: [
    {
      id: 'demo-crm-act-1',
      prospect_id: 'demo-prospect-1',
      rep_id: DEMO_REP_PT,
      type: 'call',
      result: 'no_answer',
      note: 'Liguei 2x, n atende',
      next_action_at: null,
      next_action_text: null,
      client_ref: null,
      created_at: atToday(11, 7),
    },
    {
      id: 'demo-crm-act-2',
      prospect_id: 'demo-prospect-1',
      rep_id: DEMO_REP_PT,
      type: 'call',
      result: 'lunch_break',
      note: 'Está em horário de almoço',
      next_action_at: atToday(15, 0),
      next_action_text: 'Está em horário de almoço. Ligar às 15h',
      client_ref: null,
      created_at: atToday(13, 7),
    },
    {
      id: 'demo-crm-act-3',
      prospect_id: 'demo-prospect-2',
      rep_id: DEMO_REP_PT,
      type: 'call',
      result: 'reception_no_dm',
      note: 'A recepcionista Ana diz que às 14h30 talvez tenhamos sorte',
      next_action_at: atToday(14, 30),
      next_action_text: 'A recepcionista Ana diz que aí talvez tenhamos sorte',
      client_ref: null,
      created_at: iso(-60 * 26),
    },
    {
      id: 'demo-crm-act-4',
      prospect_id: 'demo-prospect-4',
      rep_id: DEMO_REP_PT,
      type: 'call',
      result: 'interested',
      note: 'Falei com o Dr. Nuno. Quer ver preços, indicada pela Mónica da Colgate',
      next_action_at: inDays(1, 9),
      next_action_text: 'Quer proposta por email',
      client_ref: null,
      created_at: iso(-60 * 4),
    },
    {
      id: 'demo-crm-act-5',
      prospect_id: 'demo-prospect-5',
      rep_id: DEMO_REP_ES,
      type: 'call',
      result: 'meeting_set',
      note: 'Reunión el jueves a las 11h con la Dra. Ruiz',
      next_action_at: inDays(2, 11),
      next_action_text: 'Reunión con la Dra. Ruiz',
      client_ref: null,
      created_at: iso(-60 * 20),
    },
    {
      id: 'demo-crm-act-6',
      prospect_id: 'demo-prospect-3',
      rep_id: DEMO_REP_PT,
      type: 'call',
      result: 'on_holiday',
      note: 'Dr Tomás está de férias até dia 3',
      next_action_at: iso(-60 * 5),
      next_action_text: 'De férias até dia 3. Ligar a partir das 10h',
      client_ref: null,
      created_at: iso(-60 * 30),
    },
  ],
}

/**
 * One store per process, not one per module graph.
 *
 * Same reason lib/demo/overrides exists: Next compiles pages and server actions
 * into separate module graphs, so a plain exported const hands the action one
 * copy of the seed and the page another. A simulated call would write a booking
 * into a store nobody could then read from the agenda, and the demo's whole
 * claim — press this, watch that change — would quietly stop being true.
 *
 * globalThis is shared by both graphs, because both run in the same Node
 * process. Whichever graph loads first wins; the other's seed is discarded.
 * Nothing survives a restart, which is exactly what demo mode promises.
 */
const STORE_KEY = Symbol.for('telma.demo.store')
const globalStore = globalThis as unknown as Record<symbol, DemoStore | undefined>

export const store: DemoStore = (globalStore[STORE_KEY] ??= seed)

// ── THE TWO MORNINGS ────────────────────────────────────────────────────────
// The seed above is a clinic weeks into using Telma. That is the right panel
// for showing what the product does and the wrong one for the question a
// clinic actually asks before buying, which is what the first morning looks
// like. So the store can be rewound to the morning after the sign-up.
//
// A pristine copy is kept because rewinding has to be reversible: the demo bar
// switches both ways, and a mutated store cannot reconstruct itself. Cloned
// rather than re-seeded, because `seed` is one object built once and every
// date in it is relative to the moment the module loaded.
const PRISTINE: DemoStore = structuredClone(seed)

/** Which morning the store is currently showing. Undefined until the first
 *  request decides, which is why every entry point asks. */
let current: DemoStage | undefined

/**
 * Put the store into the morning asked for.
 *
 * Idempotent and cheap on the common path: a request that wants the morning
 * already on screen compares one string and returns. Only a change rewrites,
 * and a rewrite is a clone of a few hundred rows held in memory.
 *
 * Mutates the store's arrays in place rather than replacing the object:
 * `store` is imported by name in a dozen modules and reassigning it would
 * leave half the panel reading yesterday's copy.
 */
export function applyDemoStage(stage: DemoStage): void {
  if (current === stage) return
  current = stage

  Object.assign(store, structuredClone(PRISTINE))
  if (stage === 'trabalho') return

  // ── TEN MINUTES AFTER THE SIGN-UP ─────────────────────────────────────────
  // Everything the clinic has not done yet, undone. The hours stay, because
  // the sign-up writes a week; the services do not, because it stopped asking
  // and the wizard is where they are chosen. The status is the one the
  // sign-up writes, which is what puts the wizard on the screen instead of an
  // agenda, and hides the forwarding codes until Telma can actually answer.
  const clinic = store.clinics.find((c) => c.id === DEMO_CLINIC_ID)
  if (clinic) {
    clinic.status = 'por_configurar'
    clinic.created_at = iso(-12)
    clinic.updated_at = iso(-12)
    clinic.plan_renews_at = iso(60 * 24 * 30)
    // Kept its own number and is waiting to point it at ours. The card with
    // the codes is deliberately not drawn until the clinic is active, so this
    // is what it has to become before that card means anything.
    clinic.phone_source = 'ported'
    clinic.porting_details = {
      current_number: clinic.phone ?? undefined,
      forward_type: 'no_answer',
      operator: 'MEO',
    }
  }

  // Nobody has rung yet, so there is nothing to have happened.
  store.appointments = store.appointments.filter((a) => a.clinic_id !== DEMO_CLINIC_ID)
  store.calls = store.calls.filter((c) => c.clinic_id !== DEMO_CLINIC_ID)
  store.usage = store.usage.map((u) =>
    u.clinic_id === DEMO_CLINIC_ID ? { ...u, minutes: 0 } : u
  )

  // One charge, which is the one they have just made. A first morning with
  // four invoices on it is not a first morning.
  store.purchases = store.purchases
    .filter((p) => p.clinic_id === DEMO_CLINIC_ID && p.purchase_type === 'plan_upgrade')
    .slice(-1)
    .map((p) => ({ ...p, purchased_at: iso(-12), created_at: iso(-12), updated_at: iso(-12) }))

  store.activity_log = store.activity_log.filter(
    (e) => e.clinic_id !== DEMO_CLINIC_ID || e.type === 'clinic_created'
  )

  // The welcome has not been given. This is the whole reason the tour exists
  // and the one thing the demo could never show.
  for (const user of store.users) {
    if (user.clinic_id === DEMO_CLINIC_ID) user.welcomed_at = null
  }
}

export function getDemoUser(role: UserRole): AppUser {
  if (role === 'interno' || role === 'comercial') {
    const u = store.users.find((x) => x.role === role)
    if (u) return { ...u, clinic: null }
  }
  const u = store.users.find((x) => x.role === 'clinica')!
  const clinic = store.clinics.find((c) => c.id === u.clinic_id) ?? null
  return { ...u, clinic }
}
