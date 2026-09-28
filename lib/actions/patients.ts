'use server'

import { revalidatePath } from 'next/cache'
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

export async function savePatientNotes(patientId: string, notes: string) {
  const cid = await writableClinicId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('patients')
    .update({ notes: notes.trim().slice(0, 2000) || null })
    .eq('id', patientId)
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
