import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { getClinicWithPlan, isCapability } from '@/lib/clinic-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/clinic/:id/capabilities
// GET /api/clinic/:id/capabilities?capability=whatsapp
//
// What this clinic may do. The whole map by default, because the agent asks
// once and then knows; a single capability when a caller has one yes or no
// question and wants an answer it can branch on without reading a map.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const context = await getClinicWithPlan(id)
  if (!context) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }

  const asked = new URL(request.url).searchParams.get('capability')
  if (asked) {
    // An unknown name is answered with false rather than a 400: a typo in a
    // caller should close the door, not open it, and never crash the call.
    return NextResponse.json({
      clinic_id: id,
      capability: asked,
      enabled: isCapability(asked) ? context.capabilities[asked] : false,
      known: isCapability(asked),
    })
  }

  return NextResponse.json({
    clinic_id: id,
    plan: context.plan.id,
    addons: context.addons,
    capabilities: context.capabilities,
  })
}
