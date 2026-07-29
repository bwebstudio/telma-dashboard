import { NextResponse } from 'next/server'
import { getAppUser, isCrmUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  CRM_ACTIVITY_TYPES,
  CRM_RESULTS,
  type CrmActivityInput,
  type CrmActivityType,
  type CrmResult,
} from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

// Endpoint behind the offline queue on the phone.
//
// It accepts a batch because the queue may have several notes waiting after a
// stretch with no coverage. Writes go through the user session, so Row Level
// Security decides which prospects they may touch. client_ref has a unique
// index: a retry of an already stored activity is a no-op, not a duplicate.

const RESULTS = new Set<string>([...CRM_RESULTS, 'other'])
const TYPES = new Set<string>(CRM_ACTIVITY_TYPES)

// Postgres unique_violation. Means this activity is already stored.
const DUPLICATE = '23505'

function clean(raw: unknown): CrmActivityInput | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>

  const prospect_id = typeof a.prospect_id === 'string' ? a.prospect_id : ''
  const client_ref = typeof a.client_ref === 'string' ? a.client_ref : ''
  if (!prospect_id || !client_ref) return null

  const type = TYPES.has(String(a.type)) ? (a.type as CrmActivityType) : 'call'
  const result = RESULTS.has(String(a.result)) ? (a.result as CrmResult) : null

  // The timestamp comes from the phone: it is when the rep actually made the
  // call, which may be a while before coverage came back. Clock skew forward
  // is clamped so a wrong phone clock cannot park an activity in the future.
  const now = Date.now()
  const stamped = typeof a.created_at === 'string' ? Date.parse(a.created_at) : NaN
  const created_at = new Date(
    Number.isNaN(stamped) ? now : Math.min(stamped, now)
  ).toISOString()

  const nextRaw = typeof a.next_action_at === 'string' ? Date.parse(a.next_action_at) : NaN
  const next_action_at = Number.isNaN(nextRaw) ? null : new Date(nextRaw).toISOString()

  return {
    client_ref,
    prospect_id,
    type,
    result,
    note: typeof a.note === 'string' && a.note.trim() ? a.note.trim().slice(0, 4000) : null,
    next_action_at,
    next_action_text:
      typeof a.next_action_text === 'string' && a.next_action_text.trim()
        ? a.next_action_text.trim().slice(0, 200)
        : null,
    created_at,
  }
}

export async function POST(request: Request) {
  const me = await getAppUser()
  if (!me || !isCrmUser(me)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const raw = (body as { activities?: unknown[] })?.activities
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 })
  }

  const items = raw.map(clean).filter((x): x is CrmActivityInput => x !== null)
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }

  const supabase = await createClient()

  // Reps sign their own entries. An internal admin without a rep row leaves
  // rep_id null rather than borrowing somebody else's name.
  const { data: rep } = await supabase.from('crm_reps').select('id').eq('id', me.id).maybeSingle()
  const repId = rep ? me.id : null

  let stored = 0
  for (const item of items) {
    const { error } = await supabase.from('crm_activities').insert({
      prospect_id: item.prospect_id,
      rep_id: repId,
      type: item.type,
      result: item.result,
      note: item.note,
      next_action_at: item.next_action_at,
      next_action_text: item.next_action_text,
      client_ref: item.client_ref,
      created_at: item.created_at,
    })

    if (!error || error.code === DUPLICATE) {
      stored += 1
      continue
    }
    // A real failure (no connection to Postgres, RLS refusal): report it so
    // the phone keeps the batch and tries again later.
    return NextResponse.json(
      { ok: false, error: error.message, stored },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, stored })
}
