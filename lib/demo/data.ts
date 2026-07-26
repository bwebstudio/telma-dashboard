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

export const DEMO_CLINIC_ID = 'demo-clinic-1'
const CLINIC_2 = 'demo-clinic-2'

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
      call_limit: 600,
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
      call_limit: 250,
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
      email: 'equipa@bwebstudio.com',
      full_name: 'Equipa Bweb',
      role: 'interno',
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
    { id: 'usage-1', clinic_id: DEMO_CLINIC_ID, month: monthKey, calls_count: 312, minutes: 520.5 },
    { id: 'usage-2', clinic_id: CLINIC_2, month: monthKey, calls_count: 214, minutes: 190.0 },
  ],
  activity_log: [
    { id: 'act-1', clinic_id: DEMO_CLINIC_ID, type: 'call_received', message: 'A Telma atendeu uma chamada', created_at: atToday(11, 20) },
    { id: 'act-2', clinic_id: DEMO_CLINIC_ID, type: 'appointment_created', message: 'A Telma deixou uma pré-marcação para Ana Martins', created_at: atToday(9, 12) },
    { id: 'act-3', clinic_id: CLINIC_2, type: 'limit_warning', message: 'A clínica passou 80% do limite de chamadas (214/250)', created_at: iso(-60 * 4) },
    { id: 'act-4', clinic_id: CLINIC_2, type: 'call_received', message: 'A Telma atendeu uma chamada', created_at: iso(-60 * 3) },
  ],
}

export function getDemoUser(role: UserRole): AppUser {
  if (role === 'interno') {
    const u = store.users.find((x) => x.role === 'interno')!
    return { ...u, clinic: null }
  }
  const u = store.users.find((x) => x.role === 'clinica')!
  const clinic = store.clinics.find((c) => c.id === u.clinic_id) ?? null
  return { ...u, clinic }
}
