export type PlanType = 'essencial' | 'clinica' | 'rede' | 'personalizado'
export type ClinicStatus = 'ativa' | 'pausada' | 'cancelada'
// 'interno' is the Bweb Studio team (full reach, including the CRM admin
// views). 'comercial' is a sales rep: internal, but scoped to their own
// prospects. 'clinica' is a paying client.
export type UserRole = 'interno' | 'clinica' | 'comercial'
export const INTERNAL_ROLES: UserRole[] = ['interno', 'comercial']
// 'rejeitada' is the clinic turning a booking down. 'cancelada' is a booking
// that existed and was called off — usually by the patient, through Telma.
export type AppointmentStatus =
  | 'pendente'
  | 'confirmada'
  | 'rejeitada'
  | 'copiada'
  | 'cancelada'
export type AppointmentOrigin = 'telefone' | 'whatsapp'
export type CallResult = 'marcacao' | 'transferida' | 'informacao' | 'nao_resolvida'
export type ConversationChannel = 'telefone' | 'whatsapp'

/** One turn of a conversation: a spoken line, or a WhatsApp message. */
export interface TranscriptTurn {
  speaker: 'telma' | 'paciente'
  text: string
  at?: string
}

// A clinic picks a name, not a colour. Every one of these has been checked to
// carry white text and to read as itself next to the status tones.
export const CLINIC_ACCENTS = ['brand', 'ocean', 'plum', 'clay', 'slate'] as const
export type ClinicAccent = (typeof CLINIC_ACCENTS)[number]

export interface Clinic {
  id: string
  name: string
  address: string | null
  phone: string | null
  contact_email: string | null
  plan: PlanType
  addon_whatsapp: boolean
  status: ClinicStatus
  /** Monthly allowance in minutes of conversation. Plans are metered in minutes. */
  minute_limit: number
  assigned_phone: string | null
  voice_agent_id: string | null
  voice_name: string | null
  /** IANA zone. The agenda's day boundary is the clinic's, never the server's. */
  timezone: string
  /** The clinic's own logo, shown in its panel instead of the Telma wordmark. */
  logo_url: string | null
  accent: ClinicAccent
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
  cancelled_at: string | null
  cancelled_by: 'paciente' | 'clinica' | null
  cancel_reason: string | null
  created_at: string
}

/**
 * One conversation Telma had with a patient. A phone call and a WhatsApp
 * thread are the same row: the receptionist's day is one timeline, not two.
 * `duration_seconds` is 0 for WhatsApp, which is metered by minutes it never
 * spends.
 */
export interface Call {
  id: string
  clinic_id: string
  channel: ConversationChannel
  from_phone: string | null
  patient_name: string | null
  duration_seconds: number
  result: CallResult | null
  summary: string | null
  transcript: TranscriptTurn[] | null
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
