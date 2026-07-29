import { redirect } from 'next/navigation'
import { getAppUser, isCrmAdmin, isCrmUser } from '@/lib/auth'
import { getDict } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import type { AppUser } from '@/lib/types'
import type { Dictionary, Locale } from '@/content'
import type {
  CrmActivity,
  CrmContact,
  CrmProspect,
  CrmRep,
  CrmStage,
  CrmCountry,
} from './types'

// Server side reads for the CRM.
//
// Row Level Security already scopes everything: a rep only ever receives their
// own prospects plus the unassigned ones in their country. So these helpers
// fetch what the user is allowed to see and narrow it further in JavaScript.
// The sales pipeline is hundreds of rows, not millions; keeping the filtering
// in one place is worth more here than pushing every filter into SQL.

const MAX_ROWS = 2000

export interface CrmSession {
  user: AppUser
  isAdmin: boolean
  rep: CrmRep | null
  locale: Locale
  dict: Dictionary
}

export async function requireCrmSession(): Promise<CrmSession> {
  const user = await getAppUser()
  if (!user) redirect('/login')
  if (!isCrmUser(user)) redirect('/')

  const { locale, dict } = await getDict()
  const supabase = await createClient()
  const { data } = await supabase.from('crm_reps').select('*').eq('id', user.id).maybeSingle()

  return {
    user,
    isAdmin: isCrmAdmin(user),
    rep: (data as CrmRep | null) ?? null,
    locale,
    dict,
  }
}

type Db = Awaited<ReturnType<typeof createClient>>

export async function fetchReps(supabase: Db): Promise<CrmRep[]> {
  const { data } = await supabase.from('crm_reps').select('*').order('full_name')
  return (data as CrmRep[] | null) ?? []
}

export async function fetchVisibleProspects(supabase: Db): Promise<CrmProspect[]> {
  const { data } = await supabase
    .from('crm_prospects')
    .select('*')
    .order('next_action_at', { ascending: true })
    .limit(MAX_ROWS)
  return (data as CrmProspect[] | null) ?? []
}

export async function fetchProspect(supabase: Db, id: string): Promise<CrmProspect | null> {
  const { data } = await supabase.from('crm_prospects').select('*').eq('id', id).maybeSingle()
  return (data as CrmProspect | null) ?? null
}

export async function fetchContacts(supabase: Db, prospectId: string): Promise<CrmContact[]> {
  const { data } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: true })
  return (data as CrmContact[] | null) ?? []
}

export async function fetchActivities(
  supabase: Db,
  prospectId: string
): Promise<CrmActivity[]> {
  const { data } = await supabase
    .from('crm_activities')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: true })
    .limit(500)
  return (data as CrmActivity[] | null) ?? []
}

// Last activity per prospect, for the one line summary on HOJE.
export async function fetchLastActivities(supabase: Db): Promise<Map<string, CrmActivity>> {
  const { data } = await supabase
    .from('crm_activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  const last = new Map<string, CrmActivity>()
  for (const a of (data as CrmActivity[] | null) ?? []) {
    if (!last.has(a.prospect_id)) last.set(a.prospect_id, a)
  }
  return last
}

// Filters ------------------------------------------------------------------

export interface ProspectFilters {
  q: string
  rep: string // rep id, 'none' for unassigned, '' for any
  country: string
  stage: string
  from: string // yyyy-mm-dd
  to: string
  mine: boolean
}

export function parseFilters(params: Record<string, string | undefined>): ProspectFilters {
  return {
    q: (params.q ?? '').trim(),
    rep: params.rep ?? '',
    country: params.country ?? '',
    stage: params.stage ?? '',
    from: params.from ?? '',
    to: params.to ?? '',
    mine: params.mine === '1',
  }
}

export function filtersToQuery(f: ProspectFilters): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.rep) p.set('rep', f.rep)
  if (f.country) p.set('country', f.country)
  if (f.stage) p.set('stage', f.stage)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.mine) p.set('mine', '1')
  return p.toString()
}

export function isActive(p: CrmProspect): boolean {
  return p.stage !== 'won' && p.stage !== 'lost'
}

export function applyFilters(
  rows: CrmProspect[],
  f: ProspectFilters,
  meId: string
): CrmProspect[] {
  const needle = f.q.toLowerCase()
  const needleDigits = f.q.replace(/\D/g, '')
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : null

  return rows.filter((p) => {
    if (f.mine && p.rep_id !== meId) return false
    if (f.rep === 'none' && p.rep_id !== null) return false
    if (f.rep && f.rep !== 'none' && p.rep_id !== f.rep) return false
    if (f.country && p.country !== (f.country as CrmCountry)) return false
    if (f.stage && p.stage !== (f.stage as CrmStage)) return false

    if (from !== null || to !== null) {
      if (!p.next_action_at) return false
      const t = new Date(p.next_action_at).getTime()
      if (from !== null && t < from) return false
      if (to !== null && t > to) return false
    }

    if (needle) {
      const haystack = [p.name, p.zone, p.address, p.origin_note].join(' ').toLowerCase()
      // phone_digits is generated by Postgres, but stay defensive: a row that
      // has not round tripped through the database yet may not carry it.
      const digits = p.phone_digits ?? (p.phone ?? '').replace(/\D/g, '')
      const phoneHit = needleDigits.length >= 3 && digits.includes(needleDigits)
      if (!haystack.includes(needle) && !phoneHit) return false
    }
    return true
  })
}

// Sorting used everywhere a list of prospects is shown: most urgent first,
// then the ones with no date at the bottom.
export function byUrgency(a: CrmProspect, b: CrmProspect): number {
  const ta = a.next_action_at ? new Date(a.next_action_at).getTime() : Infinity
  const tb = b.next_action_at ? new Date(b.next_action_at).getTime() : Infinity
  if (ta !== tb) return ta - tb
  return a.name.localeCompare(b.name)
}
