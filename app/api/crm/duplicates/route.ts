import { NextResponse } from 'next/server'
import { getAppUser, isCrmUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export interface DuplicateHit {
  kind: 'prospect' | 'client'
  id: string
  name: string
  zone: string | null
  phone: string | null
  rep_name: string | null
  stage: string | null
}

// Overlap check for the new clinic form.
//
// This is the one place a rep is told about a record they cannot otherwise
// see: the database function runs as security definer and returns only the
// name, the area and which colleague owns it. Without this, Sonia and Domingos
// would work the same clinic for weeks without knowing.
export async function GET(request: Request) {
  const me = await getAppUser()
  if (!me || !isCrmUser(me)) {
    return NextResponse.json({ ok: false, hits: [] }, { status: 403 })
  }

  const url = new URL(request.url)
  const name = url.searchParams.get('name') ?? ''
  const phone = url.searchParams.get('phone') ?? ''

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('crm_find_duplicates', {
    p_name: name,
    p_phone: phone,
  })

  if (error) return NextResponse.json({ ok: true, hits: [] })
  const hits = Array.isArray(data) ? (data as DuplicateHit[]) : []
  return NextResponse.json({ ok: true, hits })
}
