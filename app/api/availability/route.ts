import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function authorized(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  return (request.headers.get('authorization') || '') === `Bearer ${token}`
}

// GET /api/availability?clinic_id=...&date=YYYY-MM-DD
// Returns the free concrete times the voice agent may offer on that date.
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const clinicId = searchParams.get('clinic_id')
  const date = searchParams.get('date')
  if (!clinicId || !date) {
    return NextResponse.json({ error: 'clinic_id_and_date_required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('available_slots', {
    p_clinic_id: clinicId,
    p_date: date,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ clinic_id: clinicId, date, slots: data ?? [] })
}

// POST /api/availability  { clinic_id, slot_start, call_ref }
// Holds a concrete time for 3 minutes while the agent confirms it with the
// patient. Returns 409 if the time was just taken by another call.
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const clinicId = body.clinic_id as string | undefined
  const slotStart = body.slot_start as string | undefined
  if (!clinicId || !slotStart) {
    return NextResponse.json({ error: 'clinic_id_and_slot_start_required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('hold_slot', {
    p_clinic_id: clinicId,
    p_slot_start: slotStart,
    p_call_ref: (body.call_ref as string) ?? null,
  })

  if (error) {
    const conflict = error.message.includes('slot_locked') || error.message.includes('slot_not_available')
    return NextResponse.json(
      { error: conflict ? 'slot_unavailable' : error.message },
      { status: conflict ? 409 : 500 }
    )
  }

  return NextResponse.json({ ok: true, hold: data, expires_in_seconds: 180 })
}
