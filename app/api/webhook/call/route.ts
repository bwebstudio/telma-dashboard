import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { phoneForAppointment, plausibleName, plausiblePhone } from '@/lib/phone'
import { claimSlot, releaseSlot } from '@/lib/slot-claim'
import { notifyPatient } from '@/lib/notify-patient'
import {
  canonicalReason,
  resolveDuration,
  resolveResource,
  type DurationSource,
} from '@/lib/service-duration'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESULTS = ['marcacao', 'transferida', 'informacao', 'nao_resolvida']

/** The conversation id, under either of the two names it arrives with. */
function externalRefOf(body: Record<string, unknown>): string | null {
  return (body.call_ref as string | undefined) ?? (body.external_ref as string | undefined) ?? null
}

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
  // Checked here rather than left to Postgres. The agent's placeholder value is
  // deliberately not a UUID, so this is the path taken whenever a call starts
  // without the clinic being resolved, and letting it through returned a 500
  // with the database's own parse error in the body: an internal detail, sent
  // to a caller who is by definition not yet trusted.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId)) {
    return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })
  }
  // ── O NÚMERO PARA ONDE A PESSOA PEDIU QUE LIGASSEM ─────────────────────
  // `from_phone` é de onde a chamada veio, e é o que a rede sabe. Quando
  // alguém pede que lhe liguem para outro -- o do trabalho, o do filho, o que
  // tem cobertura em casa -- esse número só existe se for dito, e durante uma
  // manhã inteira de ensaios não chegou a lado nenhum: a Telma lia-o de volta,
  // a pessoa confirmava, e no painel ficava escrito "ligar para o contacto
  // indicado". A clínica ligaria ao número da chamada, que é precisamente o
  // que a pessoa pediu para não fazer.
  //
  // Escrito à cabeça do recado e não num campo próprio, porque é na primeira
  // linha da mensagem que a recepção olha, e porque um número que vive só numa
  // coluna que nenhum ecrã mostra é a mesma perda com outra forma.
  const callback = String(body.callback_phone ?? '').trim()
  const callbackDigits = callback.replace(/\D/g, '')
  const fromDigits = String(body.from_phone ?? '').replace(/\D/g, '')
  const callbackNote =
    callbackDigits.length >= 9 && callbackDigits.slice(-9) !== fromDigits.slice(-9)
      ? `Ligar para ${callback}.`
      : null
  if (callbackNote) {
    const said = String(body.summary ?? '').trim()
    body.summary = said ? `${callbackNote} ${said}` : callbackNote
  }

  const result = body.result as string | undefined
  if (result && !RESULTS.includes(result)) {
    return NextResponse.json({ error: 'invalid_result' }, { status: 400 })
  }

  // An appointment whose time is not a time loses the appointment, not the call.
  //
  // The first real conversation ended with Telma saying "hoy, sábado, a las
  // nueve" and sending exactly that as `scheduled_at`. Postgres refused it, the
  // whole insert failed, and the clinic ended up with no record that anybody had
  // rung at all: the worst of the three possible outcomes, and the only one that
  // is invisible. Now the call is written, the bad appointment is dropped, and
  // the agent is told plainly enough to say so out loud and fix it.
  // One call can leave more than one booking, and until now only the first
  // survived. Somebody booked a lifting and a general consultation in the same
  // conversation and the panel showed one of them: `record_call` takes a single
  // appointment, so the second was dropped without a word. A lost booking is
  // worse than a failed call, because nobody knows to ring back.
  const many = Array.isArray(body.appointments)
    ? (body.appointments as Array<Record<string, unknown>>)
    : body.appointment
      ? [body.appointment as Record<string, unknown>]
      : []

  const admin = createAdminClient()

  // How long each of these takes, worked out from the reason the caller gave.
  // The same matching the diary used when it offered the time, so what is
  // written down blocks exactly what was held.
  const { data: lengths } = await admin
    .from('clinics')
    .select(
      'service_durations, appointment_duration_minutes, slot_minutes, services, custom_services, language, appointments_auto_confirmed, takes_bookings'
    )
    .eq('id', clinicId)
    .maybeSingle()
  const clinicLengths = (lengths ?? {}) as DurationSource
  const clinic = (lengths ?? {}) as {
    appointments_auto_confirmed?: boolean | null
    takes_bookings?: boolean | null
  }
  const minutesFor = (a: Record<string, unknown>) =>
    resolveDuration(clinicLengths, (a.reason as string) ?? null).minutes

  // Which diary this belongs to.
  //
  // Named, when the caller asked for somebody. Otherwise the diary that was
  // actually free at that time, which is what the agent was offering when it
  // said the hour out loud. Leaving it null was the tempting shortcut and is
  // wrong the moment a clinic has two people: an appointment belonging to
  // nobody blocks that hour for everybody.
  const { data: diaries } = await admin
    .from('resources')
    .select('id, name')
    .eq('clinic_id', clinicId)
    .eq('active', true)
    .order('sort')
    .order('created_at')
  const rooms = (diaries ?? []) as Array<{ id: string; name: string }>

  const diaryFor = async (a: Record<string, unknown>): Promise<string | null> => {
    if (rooms.length < 2) return rooms[0]?.id ?? null

    const named = resolveResource(rooms, (a.professional as string) ?? null)
    if (named) return named

    const at = a.scheduled_at as string
    const { data: free } = await admin.rpc('available_slots', {
      p_clinic_id: clinicId,
      p_date: at.slice(0, 10),
      p_duration: minutesFor(a),
    })
    const match = ((free ?? []) as Array<{ slot_start: string; resource_id: string }>).find(
      (s) => Date.parse(s.slot_start) === Date.parse(at)
    )
    return match?.resource_id ?? rooms[0].id
  }

  const appointment = many[0] ?? null
  const extras = many.slice(1)
  let rejected: string | null = null
  let usable: Record<string, unknown> | null = null

  if (appointment) {
    const at = appointment.scheduled_at
    // ── A CLINIC THAT DOES NOT BOOK ───────────────────────────────────────
    // First, because none of the checks below mean anything here: there is no
    // hour to validate against a diary that does not exist.
    //
    // The prompt already tells her not to book on these clinics and she does
    // not, measured. But the prompt is the only thing that was stopping it,
    // and the cost of it being wrong once is the worst shape a failure can
    // take: an appointment written into a diary the clinic never opens --
    // their day screen does not even show one -- for a patient who was told
    // out loud that it was booked. Nobody finds out until somebody arrives.
    //
    // So it is refused here too. The call is still filed with its summary,
    // which is the thing the clinic actually wanted from it. See 0076.
    if (clinic.takes_bookings === false) {
      rejected = 'clinic_without_diary'
    } else if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
      rejected = 'scheduled_at_not_a_time'
    } else if (!plausiblePhone(appointment.patient_phone) && !plausiblePhone(body.from_phone)) {
      // An appointment nobody can be rung about is barely an appointment. On a
      // real call Telma accepted "345578891", read it back digit by digit, heard
      // "sí", and wrote +345578891: seven national digits where Spain uses nine.
      // Read-back does not catch this, because the caller confirms what they
      // said, not whether it was a whole number.
      //
      // Refused while she is still on the line, which is the only moment it can
      // be put right.
      rejected = 'patient_phone_not_plausible'
    } else if (!plausibleName(appointment.patient_name)) {
      rejected = 'patient_name_missing'
    } else {
      // Rebuilt field by field rather than passed through.
      //
      // A real appointment was lost because the agent, speaking Spanish, sent
      // `origin: "telefono"` where the enum says `telefone`. Postgres refused
      // the value, the insert failed, and a correct booking with the right name,
      // the right number and the right time was thrown away over one letter.
      //
      // `origin` is not a decision: a call is a call. It is set here and no
      // longer asked for. Everything else is copied across by name, so a field
      // the model invents cannot reach the database at all.
      usable = {
        patient_name: appointment.patient_name ?? null,
        // The number she took, or failing that the number the call came from.
        //
        // A booking used to be thrown away when the phone did not look whole,
        // on the reasoning that an appointment nobody can be rung about is
        // barely an appointment. True, and it discarded a real booking while
        // the network was holding the caller's number the whole time. Losing
        // the appointment was the worse of the two mistakes.
        patient_phone: phoneForAppointment(appointment.patient_phone, body.from_phone),
        // The clinic's own service, or nothing. Never what the caller said.
        reason: canonicalReason(clinicLengths, (appointment.reason as string) ?? null),
        scheduled_at: at,
        origin: 'telefone',
        note: appointment.note ?? null,
        duration_minutes: minutesFor(appointment),
        resource_id: await diaryFor(appointment),
      }
    }
  }

  // ── AND IS THE HOUR STILL FREE? ───────────────────────────────────────────
  // Last gate before anything is written. See lib/slot-claim.ts: the agent held
  // this hour while she read it back, that hold lasts three minutes, and a
  // booking call can run longer. Claiming it again here is what stops two
  // conversations ending in the same slot.
  if (usable) {
    const claim = await claimSlot(admin, {
      clinicId,
      scheduledAt: usable.scheduled_at as string,
      durationMinutes: (usable.duration_minutes as number) ?? null,
      resourceId: (usable.resource_id as string) ?? null,
      callRef: externalRefOf(body),
    })
    if (!claim.ok && claim.because === 'taken') {
      rejected = 'slot_taken'
      usable = null
    } else if (!claim.ok) {
      console.error('[call] slot claim failed open', claim.error)
    }
  }

  // One conversation, one call row, however many times this is asked for.
  //
  // Telma is told to register once at the end and she registered twice: after
  // the first booking and again after the second. Two call rows came out of one
  // conversation, the minutes were billed twice — 82 seconds plus 164 for a call
  // that lasted 164 — and the first appointment was written twice, so a clinic
  // saw three bookings where a patient had made two.
  //
  // `system__conversation_id` is the same on both attempts, which makes this
  // fixable here rather than by asking the model to be more careful. Retries and
  // dropped responses get the same protection for free.
  const externalRef = externalRefOf(body)

  if (externalRef) {
    const { data: seen } = await admin
      .from('calls')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('external_ref', externalRef)
      .maybeSingle()

    const existing = seen as { id: string } | null
    if (existing) {
      // The later attempt knows more than the earlier one: it has the whole
      // conversation behind it, so its summary and duration replace what the
      // first one guessed at.
      //
      // Through record_call rather than a direct update, because the minutes
      // have to move with the duration. The update used to be written here on
      // its own and `usage` kept whatever the first, shorter delivery had
      // guessed: a charge too small, which nobody reports. record_call is an
      // upsert now and moves usage by the difference, so a repeat of the same
      // duration moves it by nothing and a correction moves it by what changed.
      await admin.rpc('record_call', {
        p_clinic_id: clinicId,
        p_from_phone: (body.from_phone as string) ?? null,
        p_duration: Number(body.duration_seconds) || 0,
        p_result: rejected ? 'nao_resolvida' : (result ?? null),
        p_summary: (body.summary as string) ?? null,
        p_recording_url: (body.recording_url as string) ?? null,
        p_external_ref: externalRef,
        // The bookings of a repeated delivery are handled below, where the ones
        // already written are known. Two writers of one booking is how a clinic
        // ends up with three appointments for two patients.
        p_appointment: null,
      })

      const { data: already } = await admin
        .from('appointments')
        .select('scheduled_at, patient_phone')
        .eq('call_id', existing.id)
      const seenKeys = new Set(
        ((already ?? []) as Array<{ scheduled_at: string; patient_phone: string | null }>).map(
          (a) => `${new Date(a.scheduled_at).toISOString()}|${(a.patient_phone ?? '').replace(/\D/g, '')}`
        )
      )

      const fresh = many
        .filter((a) => typeof a.scheduled_at === 'string' && !Number.isNaN(Date.parse(a.scheduled_at as string)))
        .filter((a) => plausiblePhone(a.patient_phone) || plausiblePhone(body.from_phone))
        .filter((a) => plausibleName(a.patient_name))
        .filter(
          (a) =>
            !seenKeys.has(
              `${new Date(a.scheduled_at as string).toISOString()}|${String(a.patient_phone ?? '').replace(/\D/g, '')}`
            )
        )

      const rows = []
      for (const a of fresh) {
        const claim = await claimSlot(admin, {
          clinicId,
          scheduledAt: a.scheduled_at as string,
          durationMinutes: minutesFor(a),
          resourceId: await diaryFor(a),
          callRef: externalRef,
        })
        if (!claim.ok && claim.because === 'taken') continue
        rows.push({
          clinic_id: clinicId,
          call_id: existing.id,
          patient_name: a.patient_name ?? null,
          patient_phone: phoneForAppointment(a.patient_phone, body.from_phone),
          reason: canonicalReason(clinicLengths, (a.reason as string) ?? null),
          scheduled_at: a.scheduled_at,
          origin: 'telefone',
          summary: (a.note as string) ?? null,
          duration_minutes: minutesFor(a),
          resource_id: await diaryFor(a),
        })
      }

      if (rows.length) {
        await admin.from('appointments').insert(rows)
        // record_call clears its own hold; these were written straight.
        for (const r of rows) await releaseSlot(admin, clinicId, r.scheduled_at as string)
      }
      return NextResponse.json({ ok: true, call_id: existing.id, added: rows.length })
    }
  }

  const { data, error } = await admin.rpc('record_call', {
    p_clinic_id: clinicId,
    p_from_phone: (body.from_phone as string) ?? null,
    p_duration: Number(body.duration_seconds) || 0,
    p_result: rejected ? 'nao_resolvida' : (result ?? null),
    p_summary: (body.summary as string) ?? null,
    p_recording_url: (body.recording_url as string) ?? null,
    p_external_ref: externalRef,
    p_appointment: usable,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The rest, hung on the same call. Written straight rather than through
  // record_call, which would have created a second call row for a single
  // conversation and doubled the minutes.
  const callId = (data as { call_id?: string } | null)?.call_id

  if (callId && extras.length) {
    const usableExtras = extras
      .filter((a) => typeof a.scheduled_at === 'string' && !Number.isNaN(Date.parse(a.scheduled_at as string)))
      .filter((a) => plausiblePhone(a.patient_phone) || plausiblePhone(body.from_phone))
      .filter((a) => plausibleName(a.patient_name))
    const rows = []
    for (const a of usableExtras) {
      const claim = await claimSlot(admin, {
        clinicId,
        scheduledAt: a.scheduled_at as string,
        durationMinutes: minutesFor(a),
        resourceId: await diaryFor(a),
        callRef: externalRef,
      })
      if (!claim.ok && claim.because === 'taken') continue
      rows.push({
        clinic_id: clinicId,
        call_id: callId,
        patient_name: a.patient_name ?? null,
        patient_phone: phoneForAppointment(a.patient_phone, body.from_phone),
        reason: canonicalReason(clinicLengths, (a.reason as string) ?? null),
        scheduled_at: a.scheduled_at,
        origin: 'telefone',
        // Its own note, not the call's. Until now these carried nothing at all,
        // so the second booking of a conversation reached the clinic as a bare
        // time with no word about what the patient had asked for.
        summary: (a.note as string) ?? null,
        duration_minutes: minutesFor(a),
        resource_id: await diaryFor(a),
      })
    }
    if (rows.length) {
      const { error: extraErr } = await admin.from('appointments').insert(rows)
      // Reported, never fatal: the call and the first booking are already
      // written, and losing them too would turn a partial record into none.
      if (extraErr) console.error('[call] extra appointments', extraErr.message)
      for (const r of rows) await releaseSlot(admin, clinicId, r.scheduled_at as string)
    }
  }

  // ── AND WHO THEY WERE ─────────────────────────────────────────────────────
  // After the bookings are written, never before, and never in a way that can
  // fail the call: a patient record is a convenience for the next call, and
  // the booking is the thing somebody is waiting on.
  //
  // Here rather than inside record_call because it is the only moment both the
  // name and the contact number have been said out loud and confirmed back —
  // which is what step 8 of the booking procedure exists to do. A name heard
  // and not confirmed is a name that goes into the record wrong.
  try {
    // Keyed on the number AND the name, not the number alone. One call can book
    // for two people in the same household — a mother ringing for herself and
    // her son — and keying on the number meant the second one was skipped and
    // then given the first one's record.
    const seen = new Set<string>()
    for (const a of [...(usable ? [usable] : []), ...extras]) {
      const name = typeof a?.patient_name === 'string' ? a.patient_name.trim() : ''
      const phone = phoneForAppointment(a?.patient_phone, body.from_phone)
      const digits = String(phone ?? '').replace(/\D/g, '').slice(-9)
      const who = `${digits}|${name.toLowerCase()}`
      if (!name || digits.length < 9 || seen.has(who)) continue
      seen.add(who)
      const { data: patientId } = await admin.rpc('remember_patient', {
        p_clinic_id: clinicId,
        p_name: name,
        p_phone: phone,
      })
      // And the bookings of this call point at it. Without this the table is a
      // list nobody joins to: the panel could not show that somebody has been
      // here before, which is the whole reason it exists.
      if (patientId && callId) {
        await admin
          .from('appointments')
          .update({ patient_id: patientId })
          .eq('clinic_id', clinicId)
          .eq('call_id', callId)
          .eq('patient_phone', phone)
          // And the name, for the same reason: two bookings on one number in one
          // call are two people, and without this both would point at whichever
          // record was written first.
          .eq('patient_name', name)
      }
    }
  } catch (e) {
    // Never fatal. The clinic has its booking either way, and the only thing
    // lost is that Telma asks this person their name again next time.
    console.error('[call] remember_patient', e instanceof Error ? e.message : e)
  }

  // ── THE CLINIC THAT CONFIRMS NOTHING ──────────────────────────────────────
  // Telma books, confirms and tells the patient, all inside the call. For the
  // clinics that chose it, a booking that waits for somebody to press a button
  // is the work they were trying to hand over.
  //
  // Here and not inside `record_call`: the SMS cannot be sent from SQL, and a
  // status written without the message going out would be the same silence as
  // before with a different word on the screen.
  //
  // Everything in this block is best effort. The booking is already written
  // and the call is already recorded; a telephone network that will not take
  // an SMS must not turn a booking into an error.
  if (clinic.appointments_auto_confirmed && callId) {
    try {
      const { data: justBooked } = await admin
        .from('appointments')
        .update({ status: 'confirmada', decided_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
        .eq('call_id', callId)
        .eq('status', 'pendente')
        .select('id')

      for (const row of (justBooked ?? []) as Array<{ id: string }>) {
        await notifyPatient(row.id, 'confirmada')
      }
    } catch (e) {
      console.error('[call] auto-confirm', e instanceof Error ? e.message : e)
    }
  }

  if (rejected) {
    return NextResponse.json(
      {
        ok: false,
        error: rejected,
        // Written for the agent to read mid-call, because it is the only party
        // still talking to the patient and the only one who can put it right.
        message:
          rejected === 'clinic_without_diary'
            ? 'A chamada ficou registada mas a marcação não: esta clínica não tem agenda e as marcações são tratadas por pessoas. Não diga que ficou marcada. Tome o recado com o nome, o número e o motivo, e diga que a clínica liga de volta.'
            : rejected === 'patient_phone_not_plausible'
            ? 'A chamada ficou registada mas a marcação não: o telefone não parece um número completo. Peça-o outra vez à pessoa, diga quantos algarismos ouviu, e volte a registar. Em Espanha e em Portugal são nove algarismos.'
            : rejected === 'patient_name_missing'
              ? 'A chamada ficou registada mas a marcação não: falta o nome de quem vem. Peça o nome, repita-o para confirmar, e volte a registar.'
              : rejected === 'slot_taken'
                ? 'A chamada ficou registada mas a marcação não: essa hora foi ocupada entretanto. Peça desculpa, ofereça outra hora com telma_horas_livres e volte a registar.'
                : 'A chamada ficou registada mas a marcação não: scheduled_at tem de ser a hora tal como veio em slot_start, em ISO 8601. Diga à pessoa que a marcação não ficou e que a clínica liga a confirmar.',
        ...(data as object),
      },
      { status: 422 }
    )
  }

  // Release any remaining hold created during this call.
  if (body.call_ref) {
    await admin.rpc('release_slot_by_ref', { p_call_ref: body.call_ref as string })
  }

  return NextResponse.json({ ok: true, ...(data as object) })
}

