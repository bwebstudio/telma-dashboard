import type {
  Clinic,
  AppUser,
  AvailabilitySlot,
  BlockedDay,
  Appointment,
  Call,
  Usage,
  ActivityEvent,
  UserRole,
} from '@/lib/types'
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

export const store: DemoStore = {
  clinics: [
    {
      id: DEMO_CLINIC_ID,
      name: 'Clínica Dentária Sorriso',
      address: 'Rua das Flores 12, Porto',
      phone: '+351 220 000 000',
      contact_email: 'geral@sorriso.pt',
      plan: 'clinica',
      addon_whatsapp: true,
      status: 'ativa',
      minute_limit: 750,
      assigned_phone: '+351 300 500 900',
      voice_agent_id: 'agent_sorriso_01',
      voice_name: 'Telma PT',
      created_at: iso(-60 * 24 * 40),
      updated_at: iso(-60),
    },
    {
      id: CLINIC_2,
      name: 'Estética Luz',
      address: 'Avenida Central 88, Lisboa',
      phone: '+351 210 111 222',
      contact_email: 'ola@esteticaluz.pt',
      plan: 'essencial',
      addon_whatsapp: false,
      status: 'ativa',
      minute_limit: 250,
      assigned_phone: '+351 300 700 100',
      voice_agent_id: 'agent_luz_01',
      voice_name: 'Telma PT',
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
      clinic: null,
    },
    {
      id: 'demo-user-interno',
      email: 'info@bwebstudio.com',
      full_name: 'Bweb Studio',
      role: 'interno',
      clinic_id: null,
      locale: 'pt',
      clinic: null,
    },
    {
      id: DEMO_REP_PT,
      email: 'domingos@telma.pt',
      full_name: 'Domingos',
      role: 'comercial',
      clinic_id: null,
      locale: 'pt',
      clinic: null,
    },
  ],
  availability_slots: [...seedSlots(DEMO_CLINIC_ID), ...seedSlots(CLINIC_2)],
  blocked_days: [
    { id: 'block-1', clinic_id: DEMO_CLINIC_ID, day: inDays(9, 0).slice(0, 10), reason: 'Feriado' },
  ],
  appointments: [
    {
      id: 'appt-1',
      clinic_id: DEMO_CLINIC_ID,
      call_id: 'call-1',
      patient_name: 'Ana Martins',
      patient_phone: '+351 912 345 678',
      reason: 'Limpeza',
      scheduled_at: inDays(2, 10),
      status: 'pendente',
      origin: 'telefone',
      summary: 'A Telma marcou uma limpeza. A paciente prefere de manhã.',
      reject_reason: null,
      decided_at: null,
      created_at: iso(-35),
    },
    {
      id: 'appt-2',
      clinic_id: DEMO_CLINIC_ID,
      call_id: 'call-2',
      patient_name: 'João Pereira',
      patient_phone: '+351 933 222 111',
      reason: 'Dor de dente',
      scheduled_at: inDays(1, 15),
      status: 'pendente',
      origin: 'whatsapp',
      summary: 'Dor num molar. A Telma marcou para amanhã à tarde.',
      reject_reason: null,
      decided_at: null,
      created_at: iso(-90),
    },
    {
      id: 'appt-3',
      clinic_id: DEMO_CLINIC_ID,
      call_id: null,
      patient_name: 'Rita Sousa',
      patient_phone: '+351 966 000 111',
      reason: 'Consulta de rotina',
      scheduled_at: inDays(3, 11),
      status: 'copiada',
      origin: 'telefone',
      summary: 'Rotina anual.',
      reject_reason: null,
      decided_at: iso(-60 * 5),
      created_at: iso(-60 * 6),
    },
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
      created_at: iso(-200),
    },
  ],
  calls: [
    {
      id: 'call-1',
      clinic_id: DEMO_CLINIC_ID,
      from_phone: '+351 912 345 678',
      duration_seconds: 95,
      result: 'marcacao',
      summary: 'A Telma marcou uma limpeza para a paciente Ana.',
      recording_url: null,
      created_at: atToday(9, 12),
    },
    {
      id: 'call-2',
      clinic_id: DEMO_CLINIC_ID,
      from_phone: '+351 933 222 111',
      duration_seconds: 140,
      result: 'marcacao',
      summary: 'Dor de dente, a Telma marcou para amanhã.',
      recording_url: null,
      created_at: atToday(10, 3),
    },
    {
      id: 'call-3',
      clinic_id: DEMO_CLINIC_ID,
      from_phone: '+351 933 111 222',
      duration_seconds: 40,
      result: 'informacao',
      summary: 'A Telma respondeu sobre o horário e a morada da clínica.',
      recording_url: null,
      created_at: atToday(11, 20),
    },
    {
      id: 'call-4',
      clinic_id: DEMO_CLINIC_ID,
      from_phone: '+351 966 777 888',
      duration_seconds: 130,
      result: 'transferida',
      summary: 'Urgência, a Telma passou a chamada para a receção.',
      recording_url: null,
      created_at: iso(-60 * 26),
    },
    {
      id: 'call-5',
      clinic_id: CLINIC_2,
      from_phone: '+351 915 555 444',
      duration_seconds: 60,
      result: 'nao_resolvida',
      summary: 'A paciente desligou antes de terminar.',
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

export function getDemoUser(role: UserRole): AppUser {
  if (role === 'interno' || role === 'comercial') {
    const u = store.users.find((x) => x.role === role)
    if (u) return { ...u, clinic: null }
  }
  const u = store.users.find((x) => x.role === 'clinica')!
  const clinic = store.clinics.find((c) => c.id === u.clinic_id) ?? null
  return { ...u, clinic }
}
