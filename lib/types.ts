export type PlanType = 'essencial' | 'clinica' | 'rede' | 'personalizado'
export type ClinicStatus = 'ativa' | 'pausada' | 'cancelada'
// 'interno' is the Bweb Studio team (full reach, including the CRM admin
// views). 'comercial' is a sales rep: internal, but scoped to their own
// prospects. 'clinica' is a paying client.
export type UserRole = 'interno' | 'clinica' | 'comercial'
export const INTERNAL_ROLES: UserRole[] = ['interno', 'comercial']
export type AppointmentStatus = 'pendente' | 'confirmada' | 'rejeitada' | 'copiada'
export type AppointmentOrigin = 'telefone' | 'whatsapp'
export type CallResult = 'marcacao' | 'transferida' | 'informacao' | 'nao_resolvida'

export interface Clinic {
  id: string
  name: string
  address: string | null
  phone: string | null
  contact_email: string | null
  plan: PlanType
  addon_whatsapp: boolean
  status: ClinicStatus
  call_limit: number
  assigned_phone: string | null
  voice_agent_id: string | null
  voice_name: string | null
  created_at: string
  updated_at: string
}

export interface AppUser {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  clinic_id: string | null
  locale: string
  clinic: Clinic | null
}

export interface AvailabilitySlot {
  id: string
  clinic_id: string
  weekday: number
  start_time: string
  end_time: string
  capacity: number
  active: boolean
}

export interface BlockedDay {
  id: string
  clinic_id: string
  day: string
  reason: string | null
}

export interface Appointment {
  id: string
  clinic_id: string
  call_id: string | null
  patient_name: string
  patient_phone: string
  reason: string | null
  scheduled_at: string
  status: AppointmentStatus
  origin: AppointmentOrigin
  summary: string | null
  reject_reason: string | null
  decided_at: string | null
  created_at: string
}

export interface Call {
  id: string
  clinic_id: string
  from_phone: string | null
  duration_seconds: number
  result: CallResult | null
  summary: string | null
  recording_url: string | null
  created_at: string
}

export interface Usage {
  id: string
  clinic_id: string
  month: string
  calls_count: number
  minutes: number
}

export interface ActivityEvent {
  id: string
  clinic_id: string | null
  type: string
  message: string
  created_at: string
}
