import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULTS = ['marcacao', 'transferida', 'informacao', 'nao_resolvida']

function authorized(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  const header = request.headers.get('authorization') || ''
  return header === `Bearer ${token}`
}

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
  if (!clinicId) {
    return NextResponse.json({ error: 'clinic_id_required' }, { status: 400 })
  }
  const result = body.result as string | undefined
  if (result && !RESULTS.includes(result)) {
    return NextResponse.json({ error: 'invalid_result' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: (body.from_phone as string) ?? null,
    p_duration: (body.duration_seconds as number) ?? 0,
    p_result: result ?? null,
    p_summary: (body.summary as string) ?? null,
    p_recording_url: (body.recording_url as string) ?? null,
    p_external_ref: (body.external_ref as string) ?? null,
    p_appointment: (body.appointment as object) ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Release any remaining hold created during this call.
  if (body.call_ref) {
    await admin.rpc('release_slot_by_ref', { p_call_ref: body.call_ref as string })
  }

  return NextResponse.json({ ok: true, ...(data as object) })
}
