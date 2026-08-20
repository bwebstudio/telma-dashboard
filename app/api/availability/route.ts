import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDuration, resolveResource } from '@/lib/service-duration'
import { authorizedWebhook } from '@/lib/api-auth'
import { getClinicWithPlan } from '@/lib/clinic-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/availability?clinic_id=...&date=YYYY-MM-DD
//
// The free concrete times the voice agent may offer on that date.
//
// A time is only offered if the clinic can actually hold the conversation that
// fills it: an agenda has free slots long after the minutes ran out, and
// offering them would book appointments the plan does not cover. So the
// allowance is checked before the agenda is read, and an empty list comes back
// with the reason, not as a silent nothing.
//
// The allowance is the plan's minutes plus any packs bought this cycle, which
// is why buying a pack mid-month reopens the agenda immediately.
export async function GET(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const clinicId = searchParams.get('clinic_id')
  const date = searchParams.get('date')
  if (!clinicId || !date) {
    return NextResponse.json({ error: 'clinic_id_and_date_required' }, { status: 400 })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }

  const blocked =
    context.clinic.status !== 'ativa'
      ? 'clinic_inactive'
      : context.minutes.exhausted
        ? 'minutes_exhausted'
        : null

  if (blocked) {
    return NextResponse.json({
      clinic_id: clinicId,
      date,
      slots: [],
      blocked,
      status: context.clinic.status,
      minutes: context.minutes,
    })
  }

  // A window of days, not a single day.
  //
  // It used to answer for one date, which quietly made an instruction in the
  // prompt impossible to obey: Telma is told to offer two times that are really
  // different, on different days, and she could only ever see one day at a time.
  // So she offered nine o'clock and half past nine on the same Monday, and
  // somebody for whom Monday morning is bad lost both at once. She was not
  // ignoring the rule, she had nothing else to offer.
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 1, 1), 14)
  // What the caller said they are coming for, in their own words. Matched to a
  // configured service here rather than by the model: asking Telma to pick an
  // internal id mid-call means reading her a list of identifiers, and she would
  // guess wrong on exactly the unusual treatments whose length is not standard.
  const wanted = resolveDuration(context.clinic, searchParams.get('service'))

  // "with Doctor Ruiz". Null when nobody was named, which asks every diary and
  // is what a caller who just wants an appointment means.
  const { data: diaries } = await createAdminClient()
    .from('resources')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('active', true)
  const withWhom = resolveResource(
    (diaries ?? []) as Array<{ id: string; name: string }>,
    searchParams.get('professional')
  )
  const admin = createAdminClient()

  const start = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'date_not_a_date' }, { status: 400 })
  }

  // Every day at once, not one after another.
  //
  // This asked the database for one day, waited, asked for the next, and so on.
  // A caller who says "whenever you have something" gets seven days looked at,
  // which was seven round trips in a row while she sat there saying "a ver..."
  // The days do not depend on each other and never did.
  const days_ = Array.from({ length: days }, (_, i) => {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + i)
    return day.toISOString().slice(0, 10)
  })

  const answers = await Promise.all(
    days_.map((iso) =>
      admin
        .rpc('available_slots', {
          p_clinic_id: clinicId,
          p_date: iso,
          // Asked for the length this particular treatment takes, so a
          // forty-five minute session is never offered at a time that runs past
          // closing and never has half an hour booked against it.
          p_duration: wanted.minutes,
          p_resource_id: withWhom,
        })
        .then((r: { data: unknown; error: { message: string } | null }) => ({ iso, ...r }))
    )
  )

  const collected: Array<Record<string, unknown>> = []
  for (const { iso, data: rows, error } of answers) {
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const slot of (rows ?? []) as Array<Record<string, unknown>>) {
      collected.push({ ...slot, date: iso })
    }
  }
  const data = collected

  // Today's slots are not all still available: the ones that have already
  // happened are not appointments, they are history.
  //
  // The database returns every slot the timetable defines for the day, which is
  // right for a diary you are looking at and wrong for a diary you are booking
  // in. On the first real conversation this endpoint was asked for today at
  // half past eight in the evening, answered with nine in the morning, and Telma
  // offered it. The caller was told his appointment was eleven hours in the past.
  //
  // Fifteen minutes of margin, because a slot starting in the next breath is not
  // one anybody can get to.
  const cutoff = Date.now() + 15 * 60 * 1000
  const all = data as Array<{ slot_start: string; date?: string }>
  const slots = all.filter((s) => {
    const t = Date.parse(s.slot_start)
    return Number.isNaN(t) || t >= cutoff
  })

  // The hour, already in the clinic's own time, as words.
  //
  // `slot_start` is UTC with an offset, and asking the model to convert it was a
  // silent two-hour bug: it offered "el martes a las cuatro y media", read
  // straight off `16:30` in the ISO string, and the appointment it then wrote was
  // half past six in Madrid. The caller hangs up believing one time and the
  // clinic holds another, and nothing anywhere reports an error. Worse, it did
  // convert correctly on other calls, so the failure is intermittent.
  //
  // So it is not asked to convert. `slot_start` becomes an opaque token to hand
  // back when holding and recording, and `say` is the only thing meant to be
  // read out.
  const zone = context.clinic.timezone
  const locale = context.clinic.language === 'es' ? 'es-ES' : 'pt-PT'
  const spoken = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const withLocal = slots.map((s) => {
    const at = new Date(s.slot_start)
    return {
      ...s,
      local_time: clock.format(at),
      say: spoken.format(at),
    }
  })

  // Only the days that actually have something, named. The agent has to pick two
  // times on different days, and counting the distinct dates itself from a flat
  // list is work it does badly and does not need to do.
  const dates = [...new Set(slots.map((s) => (s as { date?: string }).date))].filter(Boolean)

  return NextResponse.json({
    clinic_id: clinicId,
    from_date: date,
    days_searched: days,
    days_with_slots: dates,
    slots: withLocal,
    // Said out loud rather than left as a silently shorter list, so that a day
    // which comes back empty because it is over reads differently from a day
    // which comes back empty because it is full.
    past_today: all.length - slots.length,
    // How long each of these lasts. Sent back so the answer explains itself: a
    // list of times means one thing for a twenty minute check-up and another
    // for an hour of laser, and the difference is invisible otherwise.
    duration_minutes: wanted.minutes,
    service_matched: wanted.service_id,
    // Named on every slot as `resource_name`, so an agent offering two times
    // can say who each one is with. Null here means no particular person was
    // asked for, not that there is nobody.
    professional_matched: withWhom,
    blocked: null,
    minutes: context.minutes,
  })
}

// POST /api/availability  { clinic_id, slot_start, call_ref }
// Holds a concrete time for 3 minutes while the agent confirms it with the
// patient. Returns 409 if the time was just taken by another call.
//
// No allowance check here on purpose. A hold only ever follows a time this
// same endpoint offered, and pulling it back mid-sentence because the meter
// ticked over during the call is worse than honouring the last few minutes.
export async function POST(request: Request) {
  if (!authorizedWebhook(request)) {
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

  // The same rule as above, enforced on the way in as well. Filtering the list
  // stops a time in the past being offered; this stops one being held, which is
  // the step that turns it into somebody's appointment. A model that keeps a
  // stale slot from earlier in the call, or invents one, is stopped here.
  const when = Date.parse(slotStart)
  if (Number.isNaN(when)) {
    return NextResponse.json({ error: 'slot_start_not_a_time' }, { status: 400 })
  }
  if (when < Date.now()) {
    return NextResponse.json({ error: 'slot_in_the_past' }, { status: 409 })
  }

  // Held for as long as the treatment takes, not for the width of the grid. A
  // ninety minute session held as half an hour leaves the hour after it on
  // offer, and the next caller is given a time that is already gone.
  const held = await getClinicWithPlan(clinicId)
  const wanted = resolveDuration(held?.clinic ?? {}, (body.service as string) ?? null)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('hold_slot', {
    p_clinic_id: clinicId,
    p_slot_start: slotStart,
    p_call_ref: (body.call_ref as string) ?? null,
    p_duration: wanted.minutes,
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
