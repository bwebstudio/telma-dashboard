export type PlanType = 'essencial' | 'clinica' | 'rede' | 'personalizado'
export type ClinicStatus = 'ativa' | 'pausada' | 'cancelada'
// 'interno' is the Bweb Studio team (full reach, including the CRM admin
// views). 'comercial' is a sales rep: internal, but scoped to their own
// prospects. 'clinica' is a paying client.
export type UserRole = 'interno' | 'clinica' | 'comercial'
export const INTERNAL_ROLES: UserRole[] = ['interno', 'comercial']
// 'rejeitada' is the clinic turning a booking down. 'cancelada' is a booking
// that existed and was called off — usually by the patient, through Telma.
// 'expirada' is a pre-marcação nobody answered inside its window. Nothing was
// decided: the deadline passed and the hour went back on sale.
export type AppointmentStatus =
  | 'pendente'
  | 'confirmada'
  | 'rejeitada'
  | 'copiada'
  | 'cancelada'
  | 'expirada'
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

// What a clinic can be asked to do. The name is the same key in three places:
// the `feature_unlock` of an add-on, a key inside `plans.features`, and the
// argument to check_clinic_capability(). One name, so the three cannot drift.
export const CAPABILITIES = [
  'whatsapp',
  'api_integration',
  'language_en',
  'language_es',
  'custom_voice',
  'advanced_analytics',
  'priority_support',
  'multiple_languages',
  'monthly_report',
] as const
export type Capability = (typeof CAPABILITIES)[number]

export type BillingCycle = 'monthly' | 'annual'

/**
 * The running counters for the current cycle, kept on the clinic so the panel
 * and the voice agent can read them without scanning every call.
 *
 * `extra_minutes_purchased` is what minute packs added: the effective allowance
 * is the plan's minutes plus this.
 */
export interface ClinicUsage {
  minutes_used: number
  extra_minutes_used: number
  extra_minutes_purchased: number
  whatsapp_messages: number
  api_calls: number
}

export interface Clinic {
  id: string
  name: string
  address: string | null
  phone: string | null
  contact_email: string | null
  plan: PlanType
  /** @deprecated Superseded by `active_addons`. Still written by older code. */
  addon_whatsapp: boolean
  status: ClinicStatus
  /** Monthly allowance in minutes of conversation. Plans are metered in minutes. */
  minute_limit: number
  assigned_phone: string | null
  /** ElevenLabs agent. Shared per language, not per clinic. */
  voice_agent_id: string | null
  /** ElevenLabs voice: what that agent sounds like for this clinic. */
  voice_id?: string | null
  voice_name: string | null
  /** The clinic's base language, which it cannot remove. Distinct from
   *  `users.locale`, which is the language of the panel. */
  language?: string | null
  /** Every language Telma may answer this clinic's calls in. Capped by
   *  `plans.max_languages_included` and enforced by a trigger. */
  selected_languages?: string[] | null
  /** What the clinic does, as the sign-up recorded it. Read into the agent
   *  prompt so one generic agent can serve any trade. */
  specialty?: string | null
  region?: string | null
  services?: string[] | null
  custom_services?: string | null
  appointment_duration_minutes?: number | null
  min_interval_minutes?: number | null
  // The receptionist's briefing: the variables half of the prompt. The other
  // half is the personality, which lives in lib/onboarding/prompt.ts.
  /** What the clinic will say about prices. Null means it discusses none. */
  price_info?: string | null
  /** 'formal' is usted / o senhor. 'informal' is tú / você. */
  formality?: 'formal' | 'informal' | null
  fallback_policy?: 'transfer' | 'message' | 'callback' | null
  fallback_number?: string | null
  /** Anything no other field covers. Read into the prompt as written. */
  briefing?: string | null
  /** Where an emergency is escalated. Null means the clinic named nobody. */
  emergency_number?: string | null
  /** The clinic's own instructions for an emergency, read under the rules. */
  emergency_protocol?: string | null
  /** Migration 0031. Off unless the clinic said yes: nobody is rung at night
   *  by default. */
  after_hours_transfer?: boolean | null
  after_hours_patients_only?: boolean | null
  after_hours_number?: string | null
  /** Whether call audio is stored. Drives the recording notice Telma gives. */
  calls_recorded?: boolean | null
  /** IANA zone. The agenda's day boundary is the clinic's, never the server's. */
  timezone: string
  /** The clinic's own logo, shown in its panel instead of the Telma wordmark. */
  logo_url: string | null
  accent: ClinicAccent
  created_at: string
  updated_at: string

  // Billing. Optional because a row read before migration 0015 has run does not
  // carry them, and because the demo store builds clinics by hand. Read them
  // through `clinicUsage()` and `activeAddons()` in lib/clinic-utils, which
  // supply the defaults in one place instead of at every call site.
  /** Add-on ids bought on top of the plan, e.g. ['whatsapp', 'language_en']. */
  active_addons?: string[] | null
  usage_this_month?: Partial<ClinicUsage> | null
  billing_cycle?: BillingCycle | null
  /** The day the allowance resets. Null for clinics not on a paid cycle yet. */
  plan_renews_at?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  /**
   * True: a pre-marcação holds its hour for thirty minutes and then lets it go.
   * False: it waits for somebody at the clinic to answer, with no deadline.
   * Undefined on a row read before migration 0015 ran; treated as true.
   */
  pre_appointment_auto_expires?: boolean | null
}

/**
 * What a subscription includes. Everything but id and name is nullable because
 * 'personalizado' is quoted case by case: null reads as "ask us", never as zero.
 */
export interface Plan {
  id: PlanType
  name: string
  description: string | null
  price_monthly_eur: number | null
  price_annual_eur: number | null
  max_minutes_per_month: number | null
  max_locations: number
  max_concurrent_calls: number
  /** Per location beyond `max_locations`. Null when the plan sells none. */
  price_extra_location_eur: number | null
  features: Partial<Record<Capability, boolean>>
  /** How many languages the plan includes. Null is unlimited. */
  max_languages_included?: number | null
  stripe_price_id: string | null
  created_at?: string
  updated_at?: string
}

/** One feature, sold separately, on the plans listed in `compatible_with`. */
export interface Addon {
  id: string
  name: string
  description: string | null
  price_monthly_eur: number
  feature_unlock: Capability
  compatible_with: PlanType[]
  stripe_price_id: string | null
  created_at?: string
  updated_at?: string
}

export interface MinutePack {
  id: string
  name: string
  minutes: number
  price_eur: number
  /** Generated in Postgres, so it can never disagree with what is charged. */
  price_per_minute_eur: number
  /** What the same minute costs bought loose. The pack's whole argument. */
  unit_price_eur: number
  stripe_price_id: string | null
  active: boolean
}

export type MetricType =
  | 'minutes_used'
  | 'extra_minutes_used'
  | 'whatsapp_messages'
  | 'api_calls'
  | 'extra_location'

export interface UsageMetric {
  id: string
  clinic_id: string
  metric_date: string
  metric_type: MetricType
  count: number
  /** The plan on that day, snapshotted. An upgrade must not rewrite March. */
  plan_id: PlanType | null
  created_at: string
}

export type PurchaseType = 'addon' | 'minute_pack' | 'plan_upgrade' | 'plan_downgrade'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

/**
 * One charge. Prices are copied in rather than read from `plans` at invoice
 * time: a price change must never rewrite what somebody already paid.
 */
export interface Purchase {
  id: string
  clinic_id: string
  purchase_type: PurchaseType
  item_id: string
  item_name: string
  quantity: number
  unit_price_eur: number
  total_price_eur: number
  coupon_code: string | null
  discount_eur: number
  discount_percent: number
  final_price_eur: number
  payment_method: string | null
  payment_status: PaymentStatus
  /** Null until Stripe exists. The column is here so nothing has to move. */
  stripe_invoice_id: string | null
  stripe_charge_id: string | null
  purchased_at: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

/** What a coupon is worth, as the checkout needs to know it. */
export interface CouponCheck {
  valid: boolean
  discount_percent: number
  code?: string
  label?: string
  reason?: 'unknown' | 'expired'
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
  /** When the clinic acknowledged the cancellation. Null means still unread. */
  cancel_seen_at: string | null
  /**
   * When a 'pendente' pre-marcação stops holding its slot. Null means it has no
   * deadline: every other status, and the bookings that predate the rule.
   */
  expires_at?: string | null
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
