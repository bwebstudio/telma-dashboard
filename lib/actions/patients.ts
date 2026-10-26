'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUser } from '@/lib/auth'
import { BODY_LIMIT } from '@/lib/recall-copy'
import { plausiblePhone } from '@/lib/phone'
import { normalisePhone } from '@/lib/onboarding/wizard-schema'

/**
 * The patient record, and the reminders hanging off it.
 *
 * Every write here is the clinic's own, about its own patients, so the same rule
 * as lib/actions/appointments.ts: only a clinic account writes, the
 * administrator reads a panel but never acts inside it, and a sales rep has no
 * business here at all. Every statement is scoped by clinic_id as well as by id,
 * so guessing an id from another clinic changes nothing.
 */
async function writableClinicId(): Promise<string> {
  const user = await getAppUser()
  if (user?.role !== 'clinica' || !user.clinic_id) throw new Error('forbidden')
  return user.clinic_id
}

function refresh(patientId?: string) {
  revalidatePath('/pacientes')
  if (patientId) revalidatePath(`/pacientes/${patientId}`)
}

/**
 * One more thing the clinic knows about this person.
 *
 * Added, never overwritten. The record used to hold a single note, so every
 * new thing learned was written by deleting the last thing learned: "prefers
 * the morning", "nervous in the chair" and "still owes for the x-ray" are
 * three facts from three different months, and one textarea made the clinic
 * choose which of them survived.
 *
 * Still the one thing on the record Telma is never handed. It is the clinic
 * talking to itself about somebody, and a model that can be asked to read
 * something out loud must not be able to reach these.
 */
export async function addPatientNote(patientId: string, body: string) {
  const text = body.trim().slice(0, 2000)
  if (!text) return
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patient_notes')
    .insert({ clinic_id: cid, patient_id: patientId, body: text })
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * We rang them. Whether we got through is the fact the whole follow-up turns
 * on, and the one nobody writes down consistently in prose.
 *
 * Reaching somebody does not close anything by itself: a clinic can speak to
 * a patient and still be waiting for a report. Closing is its own decision,
 * taken on the record, which is why it is a separate action.
 */
export async function logContactAttempt(
  patientId: string,
  reached: boolean,
  body: string
) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase.from('patient_notes').insert({
    clinic_id: cid,
    patient_id: patientId,
    kind: 'contacto',
    reached,
    // The body carries what was said. Empty is allowed on an attempt nobody
    // answered, because there was nothing to say, so the row needs a word in
    // it that the check constraint will accept.
    body: body.trim().slice(0, 2000) || (reached ? '—' : '—'),
  })
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * Whether anything is still waiting on this person.
 *
 * A timestamp and not a flag: "pending since the 3rd" is what somebody needs
 * on a Monday morning, and a true or false cannot say it. Opening one writes
 * the reason beside it, because "pending" with no reason is a reminder to
 * remember something you have already forgotten.
 */
export async function setFollowUp(patientId: string, open: boolean, reason = '') {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const why = reason.trim().slice(0, 300)

  // What is being closed, read before it is cleared. "Seguimento fechado" on
  // its own is a line that says something ended without saying what: the
  // reason is the only thing that makes the entry worth having been written.
  let closing = ''
  let theirDigits: string[] = []
  if (!open) {
    const { data } = await supabase
      .from('patients')
      .select('follow_up_reason, phone_digits, other_digits')
      .eq('id', patientId)
      .eq('clinic_id', cid)
      .maybeSingle()
    const row = data as {
      follow_up_reason?: string | null
      phone_digits?: string | null
      other_digits?: string[] | null
    } | null
    closing = (row?.follow_up_reason ?? '').trim()
    theirDigits = [row?.phone_digits ?? '', ...(row?.other_digits ?? [])].filter(
      (d) => d.length === 9
    )
  }

  const { error } = await supabase
    .from('patients')
    .update(
      open
        ? { follow_up_since: new Date().toISOString(), follow_up_reason: why || null }
        : { follow_up_since: null, follow_up_reason: null }
    )
    .eq('id', patientId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)

  // ── AND IT GOES INTO THE STORY ────────────────────────────────────────
  // The column says what is open now. It cannot say that one was opened in
  // March and closed in April, which is exactly what somebody reading the
  // record next month needs to see. See 0073.
  //
  // The error is checked like any other. It was not, and row level security
  // was refusing this insert on every live clinic (see 0075): closing a
  // follow-up quietly wrote nothing, which is the one thing this entry exists
  // to prevent. A write that fails has to say so.
  const { error: logError } = await supabase.from('patient_notes').insert({
    clinic_id: cid,
    patient_id: patientId,
    kind: open ? 'abertura' : 'fecho',
    body: (open ? why : closing) || '—',
  })
  if (logError) throw new Error(logError.message)

  // ── AND THE CALLS GO QUIET WITH IT ────────────────────────────────────
  // "Resolvido" is a stronger sentence than "this call is dealt with": it
  // says there is nothing outstanding with this person at all. Leaving their
  // calls sitting on the day's list as "por tratar" afterwards would be the
  // record and the day telling the desk two different things about the same
  // person, and the one that got looked at second would win.
  //
  // Up to now and never after: a call that comes in later is something they
  // rang about after we had closed it, and nobody has dealt with that yet.
  // Stamped all together like any other group close, so reopening one of
  // them brings the group back. See setCallHandled.
  //
  // One direction only, on purpose. Marking a call dealt with does not close
  // the follow-up: somebody wrote a reason for opening it, and a press on an
  // unrelated line is not an answer to it.
  if (!open && theirDigits.length) {
    const { error: callsError } = await createAdminClient()
      .from('calls')
      .update({ handled_at: new Date().toISOString() })
      .eq('clinic_id', cid)
      .in('from_digits', theirDigits)
      .is('handled_at', null)
    if (callsError) throw new Error(callsError.message)
    revalidatePath('/hoje')
    revalidatePath('/conversas')
  }

  refresh(patientId)
}

/** Written by mistake, or about the wrong person. Scoped to the clinic, so a
 *  note id from somewhere else deletes nothing. */
export async function deletePatientNote(patientId: string, noteId: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patient_notes')
    .delete()
    .eq('id', noteId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * Whether this person hears about their own appointments.
 *
 * A date and not a boolean, because "when did they ask" is the question anybody
 * ever asks about an opt-out, and a true/false cannot answer it.
 */
export async function setReminders(patientId: string, wanted: boolean) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patients')
    .update({ reminders_opt_out_at: wanted ? null : new Date().toISOString() })
    .eq('id', patientId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * Whether this person hears anything commercial.
 *
 * The source is required to switch it on and that is not a form nicety. The
 * consent is the clinic's to prove, months later, to somebody who does not take
 * "the box was ticked" for an answer, and a date with nothing beside it is not
 * proof of anything. Switching it off clears both: a withdrawn consent is not a
 * consent with an asterisk.
 */
export async function setMarketing(patientId: string, wanted: boolean, source: string) {
  const cid = await writableClinicId()
  const clean = source.trim().slice(0, 200)
  if (wanted && !clean) throw new Error('source_required')
  const supabase = await createClient()
  const { error } = await supabase
    .from('patients')
    .update(
      wanted
        ? { marketing_consent_at: new Date().toISOString(), marketing_consent_source: clean }
        : { marketing_consent_at: null, marketing_consent_source: null }
    )
    .eq('id', patientId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * A reminder set by hand: the operation at three months, the treatment that has
 * no fixed interval, the person who asked to be rung in the autumn.
 *
 * Through the admin client and not the clinic's own, because `schedule_recall`
 * is security definer and is revoked from every logged-in role for that reason.
 * The clinic it writes for is the one this session belongs to, established on
 * the line above, and never a value that arrived from a browser.
 */
export async function createRecall(
  patientId: string,
  dueOn: string,
  kind: 'aviso' | 'campanha',
  note: string,
  body: string
) {
  const cid = await writableClinicId()
  const user = await getAppUser()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new Error('date_required')
  // A commercial message with nothing written in it would go out as a care
  // reminder's default sentence under a consent given for something else.
  const written = body.trim().slice(0, BODY_LIMIT)
  if (kind === 'campanha' && !written) throw new Error('body_required')
  // An untouched box is stored as nothing, so the reminder keeps taking the
  // versioned default rather than freezing today's wording into a row that goes
  // out in March.
  const sentence = written || null

  const admin = createAdminClient()
  const { error } = await admin.rpc('schedule_recall', {
    p_clinic_id: cid,
    p_patient_id: patientId,
    p_due_on: dueOn,
    p_kind: kind,
    p_note: note.trim().slice(0, 300) || null,
    p_body: sentence,
    p_actor: user?.id ?? null,
  })
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/** Called off before it goes. Deleted rather than marked: nothing happened, and
 *  a row saying nothing happened is a row somebody has to read past. */
export async function cancelRecall(recallId: string, patientId?: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patient_recalls')
    .delete()
    .eq('id', recallId)
    .eq('clinic_id', cid)
    .eq('state', 'agendado')
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * Trying again after a failure.
 *
 * A failed reminder is not retried on its own, on purpose: most failures are
 * permanent — a landline, a number typed wrong, a Twilio account out of funds —
 * and a nightly retry turns one of those into thirty attempts nobody asked for.
 * So it waits, with Twilio's own words beside it, for somebody who can tell
 * which kind it was.
 */
export async function retryRecall(recallId: string, patientId?: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patient_recalls')
    .update({
      state: 'agendado',
      due_on: new Date().toISOString().slice(0, 10),
      sent_at: null,
      error: null,
    })
    .eq('id', recallId)
    .eq('clinic_id', cid)
    .eq('state', 'falhou')
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * A record opened by hand, at the desk.
 *
 * ── WHY THIS IS NEEDED, AND WHY THERE IS NO IMPORT BUTTON ───────────────────
 * Every record so far was created by somebody saying their name and their
 * number to Telma out loud. That is the cleanest provenance a contact list can
 * have, and it also means the follow-ups only reach people who have rung since
 * the clinic started using this — which is nobody, on the first day, and a
 * fraction of a clinic's patients for a long time after.
 *
 * So one at a time, from the desk, with the person standing there. What is
 * deliberately not here is a spreadsheet upload: two thousand rows arriving with
 * no consent recorded against any of them is how a follow-up feature becomes a
 * complaint, and the clinic cannot tell us the provenance of a CSV in a way we
 * could ever stand behind.
 *
 * Through the admin client for the same reason as `createRecall`: the upsert is
 * `remember_patient`, which is security definer and revoked from every logged-in
 * role, and the clinic it writes for is the one this session belongs to.
 */
export async function createPatient(name: string, phone: string): Promise<string | null> {
  const cid = await writableClinicId()
  const clean = name.trim()
  const number = normalisePhone(phone.trim())
  if (clean.length < 2) throw new Error('name_required')
  if (!plausiblePhone(number)) throw new Error('phone_required')

  const admin = createAdminClient()
  // Upsert, not insert: somebody already on the list gets their name corrected
  // rather than a duplicate, which is the same thing that happens when they
  // ring. The nine-digit key does that, not this line.
  const { data, error } = await admin.rpc('remember_patient', {
    p_clinic_id: cid,
    p_name: clean,
    p_phone: number,
  })
  if (error) throw new Error(error.message)
  refresh()
  return (data as string | null) ?? null
}

/**
 * Correcting who this is.
 *
 * ── WHY A RECORD HAS TO BE EDITABLE AT ALL ─────────────────────────────────
 * Until the clinic could open a record by hand, every name in here was typed
 * by nobody: `remember_patient` wrote what the caller said and corrected it
 * the next time they rang. Now somebody at the desk types it while the
 * telephone is ringing, and a name typed in a hurry is a name with a letter
 * missing. A record nobody can fix is a record that gets abandoned and opened
 * again, which is how one person becomes three.
 *
 * ── THE NUMBER IS NOT JUST A FIELD ─────────────────────────────────────────
 * It is the key the calls hang from: the record shows the calls whose last
 * nine digits match, so changing it moves the history. That is the point. A
 * record opened on a mistyped number shows no calls at all, and fixing the
 * digit is what makes the person's own calls appear under them.
 *
 * What it does NOT do is keep the old number in `other_digits`, where a merge
 * puts the numbers it would otherwise lose. The two cases cannot be told
 * apart from here -- a typo and a person who changed their telephone look the
 * same -- so this takes the safer error. Keeping a mistyped number would file
 * a stranger's calls under a patient, which is a leak and silent; dropping a
 * number somebody really did change detaches old calls from the record while
 * leaving every one of them in Conversas, which is visible and undoable by
 * typing the old number back.
 *
 * ── AND THE COLLISION ──────────────────────────────────────────────────────
 * The key is (clinic, digits, name) since 0049, so an edit can land exactly on
 * a record that already exists. That is said plainly rather than swallowed:
 * the two are duplicates of one person and the screen already knows how to
 * merge them.
 *
 * ── AND WHY IT RETURNS INSTEAD OF THROWING ─────────────────────────────────
 * Next strips the message off anything thrown out of a server action in a
 * production build and hands the browser a digest instead, so a screen that
 * reads `error.message` to choose its wording works all through development
 * and says "something went wrong" to the clinic. Every answer this can give
 * is one somebody has to act on -- a name is missing, that number is not a
 * number, this person is already in the list -- so they come back as a value.
 */
export async function savePatientIdentity(
  patientId: string,
  name: string,
  phone: string
): Promise<{ ok: true } | { ok: false; why: 'name' | 'phone' | 'duplicate' | 'refused' }> {
  const cid = await writableClinicId()
  const clean = name.trim().replace(/\s+/g, ' ')
  const number = normalisePhone(phone.trim())
  if (clean.length < 2) return { ok: false, why: 'name' }
  if (!plausiblePhone(number)) return { ok: false, why: 'phone' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .update({ name: clean, phone: number })
    .eq('id', patientId)
    .eq('clinic_id', cid)
    .select('id')
    .maybeSingle()

  // 23505 is the unique index on (clinic, digits, name): this person is
  // already in the list under exactly these details.
  if (error) return { ok: false, why: error.code === '23505' ? 'duplicate' : 'refused' }
  // Nothing changed is a failure. A refused write filters rows rather than
  // raising, so without this the screen would say saved and show the old name
  // back half a second later.
  if (!data) return { ok: false, why: 'refused' }
  refresh(patientId)
  return { ok: true }
}

/**
 * The NIF, typed at the desk.
 *
 * Telma never asks for it, and this is the only door it comes through. The
 * clinic software we integrate with has the rule in one line — "é o utente que
 * o fornece, não o contrário" — and it is the same rule we already apply to the
 * name: you do not read an identifier out to somebody for them to agree with.
 *
 * Its whole purpose is the function below: two records carrying the same one
 * are the same person, said by the clinic rather than guessed by us.
 */
export async function savePatientTaxId(patientId: string, taxId: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patients')
    .update({ tax_id: taxId.trim().slice(0, 32) || null })
    .eq('id', patientId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  refresh(patientId)
}

/**
 * Two records into one.
 *
 * The decision is the clinic's and it is not reversible, which is why nothing
 * guesses it: a matching NIF or a matching name puts two records next to each
 * other on screen, and a person presses the button.
 *
 * Through the admin client, like the other two: `merge_patients` is security
 * definer and revoked from every logged-in role, and the clinic it acts for is
 * the one this session belongs to and never a value from a browser.
 */
export async function mergePatients(keepId: string, dropId: string) {
  const cid = await writableClinicId()
  const admin = createAdminClient()
  const { error } = await admin.rpc('merge_patients', {
    p_clinic_id: cid,
    p_keep: keepId,
    p_drop: dropId,
  })
  if (error) throw new Error(error.message)
  refresh(keepId)
  revalidatePath(`/pacientes/${dropId}`)
}

/**
 * Borrar una ficha.
 *
 * ── NO ES LO MISMO QUE EL DERECHO AL OLVIDO, Y LA DIFERENCIA IMPORTA ───────
 * Esto es limpieza: una ficha duplicada, una que se abrió con un nombre mal
 * entendido, una de alguien que nunca fue paciente. Se va la ficha y se van sus
 * avisos, que no tienen sentido sin ella.
 *
 * Lo que NO hace es tocar las citas. Cada una lleva su propia copia del nombre y
 * del teléfono desde que se escribió, y esa copia es el registro de la clínica
 * de una hora que trabajó. Se quedan, y pierden el vínculo con la ficha porque
 * la clave es `on delete set null`.
 *
 * Cuando lo que se pide es el derecho al olvido, esto no vale: ahí hay que
 * vaciar también las citas, las llamadas y el registro de actividad, y dejar
 * constancia de que se hizo. Eso es `erase_patient`, y vive en su propia
 * pantalla con su propio recibo. La pantalla lo dice donde está el botón.
 */
export async function deletePatient(patientId: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  // Checked for rows and not only for an error. There was no delete policy on
  // `patients` until 0083, and a refused delete returns no error: it matches
  // nothing. The button worked, the screen went back to the list, and the
  // record was still on it. Nothing changed is a failure.
  const { data: gone, error } = await supabase
    .from('patients')
    .delete()
    .eq('id', patientId)
    .eq('clinic_id', cid)
    .select('id')
  if (error) throw new Error(error.message)
  if (!gone?.length) throw new Error('not_deleted')
  revalidatePath('/pacientes')
  // La ficha ya no existe, así que quedarse en ella sería enseñar un 404 con
  // forma de error nuestro.
  redirect('/pacientes')
}

/**
 * "Somebody has dealt with this call", and the way back out of it.
 *
 * On the call and not on the person, because it is a different sentence.
 * "This person still owes us something" is the follow-up on their record and
 * outlives any one call; this is the day's list saying a line can go quiet.
 * See migration 0080.
 *
 * ── IT CLOSES THE CONVERSATION, NOT THE LINE ───────────────────────────────
 * Somebody rang on Monday and got nobody, rang again on Wednesday, rang again
 * this morning. Reception finally speaks to them, and the two older lines are
 * not pending any more: they were the same thing being asked three times.
 * Leaving them open teaches the clinic that the day's list lies, and a list
 * that lies is a list nobody works through.
 *
 * So pressing it closes every call this number has left open up to this one,
 * and never anything after it: a call that came in later is something they
 * rang about after we had spoken, which nobody has dealt with yet.
 *
 * ── AND IT CAN BE UNDONE WHOLE ─────────────────────────────────────────────
 * Closing five lines with one press and reopening only one of them would be a
 * trap, so everything closed together carries the same stamp -- one timestamp
 * chosen here, not `now()` row by row -- and reopening looks for exactly that
 * stamp. The group that went quiet together comes back together, and whatever
 * was closed on another day stays closed.
 *
 * Returns the stamp and every call it reached, because the screen counts what
 * is still open and has to move the other rows at the same time.
 */
export async function setCallHandled(
  callId: string,
  done: boolean
): Promise<{ at: string | null; ids: string[] }> {
  const cid = await writableClinicId()
  const db = createAdminClient()

  const { data: call, error: readErr } = await db
    .from('calls')
    .select('id, from_digits, created_at, handled_at')
    .eq('id', callId)
    .eq('clinic_id', cid)
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)
  if (!call) throw new Error('call not found')

  // A call with no number at all is nobody: it cannot be grouped with
  // anything, so it answers for itself alone.
  const digits = (call.from_digits as string | null) ?? ''
  const at = new Date().toISOString()

  let q = db
    .from('calls')
    .update({ handled_at: done ? at : null })
    .eq('clinic_id', cid)
  if (!digits) {
    q = q.eq('id', callId)
  } else if (done) {
    // `is null` as well, so a press never re-stamps something closed earlier
    // and swallows an older group into this one.
    q = q
      .eq('from_digits', digits)
      .lte('created_at', call.created_at as string)
      .is('handled_at', null)
  } else if (call.handled_at) {
    q = q.eq('from_digits', digits).eq('handled_at', call.handled_at as string)
  } else {
    q = q.eq('id', callId)
  }

  const { data: touched, error } = await q.select('id')
  if (error) throw new Error(error.message)
  revalidatePath('/hoje')
  revalidatePath('/conversas')
  return { at: done ? at : null, ids: ((touched ?? []) as Array<{ id: string }>).map((r) => r.id) }
}

/**
 * "I rang this number back, and this is how it went."
 *
 * Only ever on a call nobody answered, which is the one case with no person to
 * write it on: a record is somebody with a name, and a record opened on a bare
 * number is a row nobody can read. See migration 0078.
 *
 * ── AND NOW IT SAYS HOW IT WENT ────────────────────────────────────────────
 * It used to take no argument and write `reached: null`: one press, nothing
 * claimed about who picked up. The reasoning was that asking would make it two
 * presses. What it produced was a line on the day's list that counted attempts
 * and said nothing about any of them, while the record screen two clicks away
 * had the answer in colour. A press that records nothing is a press that has
 * to be made again somewhere else.
 *
 * So the day's list offers the two answers as two buttons, which is still one
 * press, and this takes which one. `null` stays legal because the rows written
 * before today carry it and because a caller with no record has nowhere to
 * keep an outcome: `calls` has the count and the hour and no column for this.
 *
 * Through the admin client and scoped by clinic, for the same reason as the
 * recalls: the clinic may not write on the calls table directly, and the
 * clinic this writes for is the one this session belongs to.
 */
export async function logCallback(
  callId: string,
  reached: boolean | null = null
): Promise<{ attempts: number; at: string; outcomeKept: boolean }> {
  const cid = await writableClinicId()
  const admin = createAdminClient()
  const at = new Date().toISOString()

  const { data: call } = await admin
    .from('calls')
    .select('callbacks, from_digits, patient_name, created_at')
    .eq('id', callId)
    .eq('clinic_id', cid)
    .maybeSingle()
  if (!call) throw new Error('call not found')

  // ── WHERE THERE IS A PERSON, IT GOES IN THEIR HISTORY ──────────────────
  // Same table, same kind of row, as the record's own "registar tentativa de
  // contacto", because it is the same act, and now with the same three
  // outcomes: the day's list and the record write one kind of note.
  const patientId = await recordForCall(admin, cid, call as CallBits)
  if (patientId) {
    const { error } = await admin.from('patient_notes').insert({
      clinic_id: cid,
      patient_id: patientId,
      kind: 'contacto',
      reached,
      body: '—',
    })
    if (error) throw new Error(error.message)
    const { count } = await admin
      .from('patient_notes')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', cid)
      .eq('patient_id', patientId)
      .eq('kind', 'contacto')
      .gte('created_at', call.created_at as string)
    revalidatePath('/hoje')
    revalidatePath('/conversas')
    refresh(patientId)
    return { attempts: count ?? 1, at, outcomeKept: true }
  }

  // ── AND WHERE THERE IS NOT, ON THE CALL ────────────────────────────────
  // A caller with no record has no history to write into, so the count lives
  // on the call. Nothing can contradict it there: they have no second screen.
  //
  // The outcome is lost here, and the day's list knows it: a row with no
  // record keeps the single button that claims nothing, because offering two
  // answers and keeping neither would be the worse kind of lie. `calls` would
  // need a column of its own for it, which is a migration and not a Sunday.
  //
  // Read then write, because a counter needs its own previous value and this
  // is one press by one person at a desk, not a race.
  const before = Number((call as { callbacks?: number }).callbacks ?? 0)
  const { error } = await admin
    .from('calls')
    .update({ callbacks: before + 1, called_back_at: at })
    .eq('id', callId)
    .eq('clinic_id', cid)
  if (error) throw new Error(error.message)
  revalidatePath('/hoje')
  revalidatePath('/conversas')
  return { attempts: before + 1, at, outcomeKept: false }
}

interface CallBits {
  from_digits?: string | null
  patient_name?: string | null
}

/**
 * Which record a call belongs to, decided the same way the day's list decides
 * it on screen.
 *
 * One number is usually one person and then there is nothing to decide. But
 * the key has been (clinic, digits, name) since 0049 because a number is
 * often a household, and with two records on one line the number alone does
 * not say who rang: the name Telma heard on the call does, by the same prefix
 * rule `remember_patient` uses. Where even that does not settle it this
 * answers null and the caller is treated as having no record, which is the
 * safe end: nothing gets written into the wrong person's history.
 *
 * It has to agree with components/clinic/MessagesDay, or a row would offer
 * "ver ficha" and then file the attempt somewhere else.
 */
async function recordForCall(
  db: ReturnType<typeof createAdminClient>,
  clinicId: string,
  call: CallBits
): Promise<string | null> {
  const digits = (call.from_digits ?? '').trim()
  if (digits.length !== 9) return null
  const { data } = await db
    .from('patients')
    .select('id, name_key')
    .eq('clinic_id', clinicId)
    .eq('phone_digits', digits)
  const people = (data ?? []) as Array<{ id: string; name_key: string | null }>
  if (people.length === 1) return people[0].id
  if (!people.length) return null
  const heard = (call.patient_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!heard) return null
  const named = people.filter((p) => (p.name_key ?? '').length > 0)
  const hit =
    named.find((p) => p.name_key === heard) ??
    named.find((p) => p.name_key!.startsWith(heard) || heard.startsWith(p.name_key!))
  return hit?.id ?? null
}
