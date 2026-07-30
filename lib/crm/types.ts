// Sales CRM entities. A prospect is a clinic the team is still trying to win.
// It is deliberately a different type from Clinic (a paying client) so the two
// can never be confused in a query or a view.

export type CrmCountry = 'PT' | 'ES'
export type CrmRepRole = 'admin' | 'comercial'
export type CrmSpecialty = 'dental' | 'aesthetic' | 'other'
export type CrmOrigin = 'cold' | 'referral'
export type CrmStage =
  | 'new'
  | 'attempting'
  | 'contacted'
  | 'interested'
  | 'meeting'
  | 'won'
  | 'lost'
export type CrmActivityType = 'call' | 'whatsapp' | 'email' | 'visit' | 'note'
export type CrmResult =
  | 'no_answer'
  | 'busy'
  | 'lunch_break'
  | 'on_holiday'
  | 'reception_no_dm'
  | 'spoke_dm'
  | 'interested'
  | 'meeting_set'
  | 'won'
  | 'lost'
  | 'other'
export type CrmContactRole = 'doctor' | 'reception' | 'other'

export const CRM_COUNTRIES: CrmCountry[] = ['PT', 'ES']
export const CRM_SPECIALTIES: CrmSpecialty[] = ['dental', 'aesthetic', 'other']
export const CRM_ORIGINS: CrmOrigin[] = ['cold', 'referral']
export const CRM_CONTACT_ROLES: CrmContactRole[] = ['doctor', 'reception', 'other']
export const CRM_STAGES: CrmStage[] = [
  'new',
  'attempting',
  'contacted',
  'interested',
  'meeting',
  'won',
  'lost',
]

// Order matters: this is the order the chips appear on the phone, from the
// most frequent outcome of a cold call to the rarest.
export const CRM_RESULTS: CrmResult[] = [
  'no_answer',
  'busy',
  'lunch_break',
  'on_holiday',
  'reception_no_dm',
  'spoke_dm',
  'interested',
  'meeting_set',
  'won',
  'lost',
]

export const CRM_ACTIVITY_TYPES: CrmActivityType[] = [
  'call',
  'whatsapp',
  'email',
  'visit',
  'note',
]

// Mirrors crm_stage_from_result() in the database, for optimistic UI.
export function stageFromResult(result: CrmResult | null): CrmStage | null {
  switch (result) {
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'meeting_set':
      return 'meeting'
    case 'interested':
      return 'interested'
    case 'spoke_dm':
      return 'contacted'
    case 'reception_no_dm':
    case 'no_answer':
    case 'busy':
    case 'lunch_break':
    case 'on_holiday':
      return 'attempting'
    default:
      return null
  }
}

// Mirrors the crm_apply_activity() trigger: what an activity does to the stage.
//
// An attempt ("nobody picked up", "they were at lunch") only ever moves a
// prospect off 'new'. It must not demote a clinic that already said it was
// interested just because today's call went unanswered. Anything reporting an
// actual conversation is applied as stated.
export function nextStage(current: CrmStage, result: CrmResult | null): CrmStage {
  const proposed = stageFromResult(result)
  if (proposed === null) return current
  if (proposed === 'attempting' && current !== 'new') return current
  return proposed
}

export interface CrmRep {
  id: string
  full_name: string
  email: string | null
  country: CrmCountry
  territory: string | null
  role: CrmRepRole
  active: boolean
  created_at: string
}

export interface CrmProspect {
  id: string
  name: string
  specialty: CrmSpecialty
  country: CrmCountry
  zone: string | null
  address: string | null
  phone: string | null
  phone_digits: string
  website: string | null
  origin: CrmOrigin
  origin_note: string | null
  rep_id: string | null
  stage: CrmStage
  next_action_text: string | null
  next_action_at: string | null
  last_activity_at: string | null
  conversion_requested_at: string | null
  converted_clinic_id: string | null
  converted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CrmContact {
  id: string
  prospect_id: string
  name: string
  role: CrmContactRole
  phone: string | null
  notes: string | null
  created_at: string
}

export interface CrmActivity {
  id: string
  prospect_id: string
  rep_id: string | null
  type: CrmActivityType
  result: CrmResult | null
  note: string | null
  next_action_at: string | null
  next_action_text: string | null
  client_ref: string | null
  created_at: string
}

// What the phone posts to /api/crm/activities, straight from the queue.
export interface CrmActivityInput {
  client_ref: string
  prospect_id: string
  type: CrmActivityType
  result: CrmResult | null
  note: string | null
  next_action_at: string | null
  next_action_text: string | null
  created_at: string
}
