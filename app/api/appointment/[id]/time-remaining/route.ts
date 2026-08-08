import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CRITICAL_SECONDS,
  HOLD_SECONDS,
  getPreAppointmentTimeRemaining,
  holdPercentage,
} from '@/lib/appointment-hold'
import type { Appointment } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/appointment/:id/time-remaining
//
// How long is left of a pre-marcação's hold. For the voice agent, which has to
// know whether the hour it offered ten minutes ago is still being held, and for
// checking by hand what the panel is drawing.
//
// The panel does not call this. A countdown needs one timestamp, not one
// request a second: `expires_at` does not move, so the browser is told it once
// with the page and counts down locally. Polling this per booking per second,
// from every open panel, would be a lot of traffic to re-learn a number nobody
// changed — and the only way the browser could carry this route's token would
// be to ship it in the bundle, where anyone could read it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('appointments')
    .select('id, clinic_id, status, expires_at, scheduled_at')
    .eq('id', id)
    .maybeSingle()

  const appointment = data as Appointment | null

  // A booking that was answered is not a hold with time left on it, so it is
  // not this route's subject. Same 404 as one that never existed: the caller
  // asked "how long do I have" and the answer is that the question no longer
  // applies.
  if (!appointment || appointment.status !== 'pendente') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const secondsRemaining = getPreAppointmentTimeRemaining(appointment)

  return NextResponse.json({
    appointment_id: appointment.id,
    clinic_id: appointment.clinic_id,
    status: appointment.status,
    // Null on the pre-marcações written before the window existed. They hold
    // their hour until somebody answers, which is the old behaviour and is not
    // being changed underneath a clinic that is already working through them.
    expires_at: appointment.expires_at ?? null,
    seconds_remaining: secondsRemaining,
    percentage: secondsRemaining === null ? null : holdPercentage(secondsRemaining),
    is_critical: secondsRemaining !== null && secondsRemaining > 0 && secondsRemaining <= CRITICAL_SECONDS,
    hold_seconds: HOLD_SECONDS,
  })
}
