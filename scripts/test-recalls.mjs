#!/usr/bin/env node
//
// Reminders, run against a real Postgres.
//
//   npm run test:recalls
//
// Every reminder here is somebody's decision about somebody: nothing schedules
// one by itself. 0047 did, from a table of intervals per service, and 0048 took
// it out again — the message never names the treatment, so a patient on two
// cycles received the same sentence twice with nothing to tell them apart, and
// a rule cannot see that somebody was discharged, moved away, or came once for
// an emergency.
//
// What is left is the part that has to be right whoever asked for it: a
// reminder cannot land in the past, on a weekend, or in another clinic's list,
// and it has to disappear when the person asks to be forgotten.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDatabase } from './lib/fresh-database.mjs'

const CLINIC = '77777777-7777-7777-7777-777777777777'
const OTHER = '88888888-8888-8888-8888-888888888888'

const db = await freshDatabase()

async function clinic(id) {
  await db.query(`delete from clinics where id = $1`, [id])
  await db.query(
    `insert into clinics (id, name, timezone, selected_languages)
     values ($1, 'Clínica Sorriso', 'Europe/Lisbon', array['pt'])`,
    [id]
  )
}

async function patient(clinicId, name, phone) {
  const { rows } = await db.query(`select remember_patient($1, $2, $3) as id`, [clinicId, name, phone])
  return rows[0].id
}

async function schedule(clinicId, patientId, dueOn, kind = 'aviso', note = null) {
  const { rows } = await db.query(
    `select schedule_recall($1, $2, $3::date, $4::recall_kind, $5) as id`,
    [clinicId, patientId, dueOn, kind, note]
  )
  return rows[0].id
}

async function recalls(clinicId = CLINIC) {
  const { rows } = await db.query(
    `select id, due_on::text as due_on, kind, state, note
       from patient_recalls where clinic_id = $1 order by due_on`,
    [clinicId]
  )
  return rows
}

async function wipe() {
  await db.query(`delete from patient_recalls`)
  await db.query(`delete from appointments`)
  await db.query(`delete from patients`)
}

// ── NOTHING SCHEDULES ITSELF ────────────────────────────────────────────────

test('accepting a booking schedules nothing', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status)
     values ($1, $2, 'Ana Torres', '+351910523903', now() + interval '7 days', 'confirmada')`,
    [CLINIC, p]
  )
  assert.equal((await recalls()).length, 0)
})

test('the trigger and its settings are gone, not merely unused', async () => {
  const { rows: triggers } = await db.query(
    `select 1 from pg_trigger where tgname = 'trg_recall_after_appointment'`
  )
  assert.equal(triggers.length, 0, 'the trigger is still on the table')

  const { rows: columns } = await db.query(
    `select column_name from information_schema.columns
      where table_name in ('clinics', 'appointments', 'patient_recalls')
        and column_name in ('recalls_enabled', 'recall_months', 'service_id', 'source', 'appointment_id')`
  )
  assert.deepEqual(columns.map((c) => c.column_name), [], 'a column from the automatic reminders survived')
})

// ── WHAT A PERSON CAN ASK FOR ───────────────────────────────────────────────

test('a reminder goes in on the day it was asked for', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  // A Thursday, so the weekend rule moves nothing.
  await schedule(CLINIC, p, '2027-07-15', 'aviso', 'revisão 3 meses após a cirurgia')
  const [r] = await recalls()
  assert.equal(r.due_on, '2027-07-15')
  assert.equal(r.note, 'revisão 3 meses após a cirurgia')
  assert.equal(r.state, 'agendado')
})

test('a reminder never lands on a Saturday or a Sunday', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  // 18 July 2027 is a Sunday. Monday the 19th.
  await schedule(CLINIC, p, '2027-07-18')
  const [r] = await recalls()
  assert.equal(r.due_on, '2027-07-19')
  const { rows } = await db.query(`select extract(isodow from $1::date) as d`, [r.due_on])
  assert.ok(Number(rows[0].d) <= 5, 'a message asking somebody to ring a shut clinic')
})

test('a date in the past means today', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await schedule(CLINIC, p, '2020-01-01')
  const { rows } = await db.query(
    `select due_on >= current_date as not_past from patient_recalls where clinic_id = $1`,
    [CLINIC]
  )
  assert.equal(rows[0].not_past, true)
})

test('two reminders for one person are two reminders', async () => {
  // No rule is writing one behind anybody's back any more, so there is nothing
  // to collide with: both were typed, both are listed on the record, and a
  // mistake is visible rather than silently swallowed.
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await schedule(CLINIC, p, '2027-07-15')
  await schedule(CLINIC, p, '2027-09-16')
  assert.equal((await recalls()).length, 2)
})

test('a clinic cannot put a reminder on another clinic\'s patient', async () => {
  await wipe()
  await clinic(CLINIC)
  await clinic(OTHER)
  const theirs = await patient(OTHER, 'Ana Torres', '+351910523903')
  assert.equal(await schedule(CLINIC, theirs, '2028-01-04'), null)
  assert.equal((await recalls()).length, 0)
})

// ── FORGETTING ──────────────────────────────────────────────────────────────

test('erasing a person removes the record and every waiting reminder', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status)
     values ($1, $2, 'Ana Torres', '+351910523903', now() - interval '7 days', 'copiada')`,
    [CLINIC, p]
  )
  await schedule(CLINIC, p, '2027-07-15')

  const { rows } = await db.query(`select erase_patient($1, $2) as r`, [CLINIC, '910523903'])
  assert.equal(rows[0].r.recalls_cancelled, 1)
  assert.equal((await recalls()).length, 0)

  const left = await db.query(`select count(*)::int as n from patients where clinic_id = $1`, [CLINIC])
  assert.equal(left.rows[0].n, 0, 'the name is still in the record after an erasure')

  // And the appointment survives with nobody in it: the clinic's record of an
  // hour it worked, which is not the patient's to erase.
  const appt = await db.query(
    `select patient_name, patient_phone from appointments where clinic_id = $1`,
    [CLINIC]
  )
  assert.equal(appt.rows[0].patient_name, 'Apagado a pedido')
  assert.equal(appt.rows[0].patient_phone, '')
})

test('the purge drops what is spent and keeps what is waiting', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const waiting = await schedule(CLINIC, p, new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10))
  await db.query(
    `insert into patient_recalls (clinic_id, patient_id, due_on, state, sent_at)
     values ($1, $2, current_date - 400, 'enviado', now() - interval '13 months')`,
    [CLINIC, p]
  )
  await db.query(
    `insert into patient_recalls (clinic_id, patient_id, due_on, state)
     values ($1, $2, current_date - 70, 'agendado')`,
    [CLINIC, p]
  )
  const { rows } = await db.query(`select purge_recalls() as r`)
  assert.equal(rows[0].r.recalls_expired, 1)
  assert.equal(rows[0].r.recalls_stale, 1)

  const left = await recalls()
  assert.equal(left.length, 1)
  assert.equal(left[0].id, waiting)
})

test('a record nobody has heard from in three years is forgotten', async () => {
  await wipe()
  await clinic(CLINIC)
  const old = await patient(CLINIC, 'Quem Foi', '+351910000002')
  const recent = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(`update patients set last_seen_at = now() - interval '4 years' where id = $1`, [old])

  // Unless something is still waiting to be sent to them, which would be a
  // reminder pointing at a record that no longer exists.
  const stale = await patient(CLINIC, 'Tem Aviso', '+351910000003')
  await db.query(`update patients set last_seen_at = now() - interval '4 years' where id = $1`, [stale])
  await schedule(CLINIC, stale, new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10))

  const { rows } = await db.query(`select purge_recalls() as r`)
  assert.equal(rows[0].r.patients_forgotten, 1)
  const left = await db.query(`select id from patients where clinic_id = $1`, [CLINIC])
  assert.deepEqual(left.rows.map((r) => r.id).sort(), [recent, stale].sort())
})

// ── A NUMBER IS NOT A PERSON ────────────────────────────────────────────────
// 0046 keyed the record on (clinic, number) and the second person to ring from a
// household handset renamed the first. These are the three cases that decide
// whether a record belongs to who it says it does.

test('two people on one handset are two records', async () => {
  await wipe()
  await clinic(CLINIC)
  const ana = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const joao = await patient(CLINIC, 'João Torres', '+351910523903')
  assert.notEqual(ana, joao, 'the second caller overwrote the first')

  const { rows } = await db.query(
    `select name from patients where clinic_id = $1 order by name`, [CLINIC]
  )
  assert.deepEqual(rows.map((r) => r.name), ['Ana Torres', 'João Torres'])
})

test('the same person said two ways is one record, and keeps the longer name', async () => {
  await wipe()
  await clinic(CLINIC)
  const first = await patient(CLINIC, 'Ana', '+351910523903')
  const again = await patient(CLINIC, 'Ana Torres', '+351910523903')
  assert.equal(again, first, 'Ana and Ana Torres came out as two people')

  const { rows } = await db.query(`select name from patients where id = $1`, [first])
  assert.equal(rows[0].name, 'Ana Torres')

  // And it does not shrink back on the call where she gives only her first name.
  await patient(CLINIC, 'ana', '+351910523903')
  const after = await db.query(`select name, count(*) over () as n from patients where clinic_id = $1`, [CLINIC])
  assert.equal(after.rows[0].name, 'Ana Torres')
  assert.equal(Number(after.rows[0].n), 1)
})

test('a name is not a prefix of an unrelated name', async () => {
  // "Ana" matches "Ana Torres" because the space makes it a whole first name.
  // "Ana" must not match "Anabela", which is somebody else entirely.
  await wipe()
  await clinic(CLINIC)
  await patient(CLINIC, 'Ana', '+351910523903')
  await patient(CLINIC, 'Anabela', '+351910523903')
  const { rows } = await db.query(
    `select count(*)::int as n from patients where clinic_id = $1`, [CLINIC]
  )
  assert.equal(rows[0].n, 2)
})

// ── TWO RECORDS, ONE PERSON ─────────────────────────────────────────────────
// The error 0049 leaves standing: somebody who rings from their mobile on Monday
// and the house telephone on Thursday. Nothing in the data can close it, so a
// person does, and the test that matters is that the merge does not quietly
// lose what it was merging.

async function merge(keep, drop) {
  const { rows } = await db.query(`select merge_patients($1, $2, $3) as r`, [CLINIC, keep, drop])
  return rows[0].r
}

test('a merge keeps the number it was split by', async () => {
  await wipe()
  await clinic(CLINIC)
  const mobile = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const landline = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  assert.notEqual(mobile, landline)

  const r = await merge(mobile, landline)
  assert.equal(r.phone_kept, '220000111')

  // And the next call from the landline finds the merged record rather than
  // opening a third one, which is the whole point.
  const again = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  assert.equal(again, mobile)
  const { rows } = await db.query(`select count(*)::int as n from patients where clinic_id = $1`, [CLINIC])
  assert.equal(rows[0].n, 1)
})

test('a merge moves the bookings and the reminders, and drops neither note', async () => {
  await wipe()
  await clinic(CLINIC)
  const keep = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const drop = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  await db.query(`update patients set notes = 'Prefere manhãs' where id = $1`, [keep])
  await db.query(`update patients set notes = 'Vem com a mãe' where id = $1`, [drop])
  await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status)
     values ($1, $2, 'Domingos Coelho', '+351220000111', now() + interval '3 days', 'confirmada')`,
    [CLINIC, drop]
  )
  await schedule(CLINIC, drop, '2027-07-15')

  const r = await merge(keep, drop)
  assert.equal(r.appointments_moved, 1)
  assert.equal(r.recalls_moved, 1)

  const { rows } = await db.query(`select notes from patients where id = $1`, [keep])
  assert.match(rows[0].notes, /Prefere manhãs/)
  assert.match(rows[0].notes, /Vem com a mãe/, 'the other record\'s note was thrown away')

  const left = await db.query(
    `select count(*)::int as n from patient_recalls where patient_id = $1`, [keep]
  )
  assert.equal(left.rows[0].n, 1)
})

test('a no on either record survives the merge, and so does a yes', async () => {
  await wipe()
  await clinic(CLINIC)
  const keep = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const drop = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  // The one being dropped is the one carrying both answers.
  await db.query(
    `update patients set reminders_opt_out_at = now(),
                         marketing_consent_at = now(),
                         marketing_consent_source = 'no balcão, 12/03'
      where id = $1`,
    [drop]
  )

  await merge(keep, drop)
  const { rows } = await db.query(
    `select reminders_opt_out_at, marketing_consent_at, marketing_consent_source
       from patients where id = $1`,
    [keep]
  )
  assert.ok(rows[0].reminders_opt_out_at, 'somebody who said stop was asked again')
  assert.ok(rows[0].marketing_consent_at, 'a consent the person gave was thrown away')
  assert.equal(rows[0].marketing_consent_source, 'no balcão, 12/03')
})

test('a merge never invents a consent', async () => {
  await wipe()
  await clinic(CLINIC)
  const keep = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const drop = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  await merge(keep, drop)
  const { rows } = await db.query(
    `select marketing_consent_at from patients where id = $1`, [keep]
  )
  assert.equal(rows[0].marketing_consent_at, null)
})

test('a clinic cannot merge another clinic\'s records', async () => {
  await wipe()
  await clinic(CLINIC)
  await clinic(OTHER)
  const mine = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const theirs = await patient(OTHER, 'Domingos Coelho', '+351220000111')
  await assert.rejects(() => merge(mine, theirs))
})

test('erasing reaches a merged record by either of its numbers', async () => {
  await wipe()
  await clinic(CLINIC)
  const keep = await patient(CLINIC, 'Domingos Coelho', '+351910523903')
  const drop = await patient(CLINIC, 'Domingos Coelho', '+351220000111')
  await merge(keep, drop)

  // The number they usually ring from is now the secondary one.
  await db.query(`select erase_patient($1, $2)`, [CLINIC, '220000111'])
  const { rows } = await db.query(`select count(*)::int as n from patients where clinic_id = $1`, [CLINIC])
  assert.equal(rows[0].n, 0, 'somebody who asked to be forgotten was told there was nothing here')
})

// ── WHAT SURVIVES A PURGE ───────────────────────────────────────────────────
// 0045 took the name off a cancelled appointment at ninety days. A cancellation
// is a record of something the patient did, and the clinic reads the next
// booking against it.

test('a cancellation keeps its name for ever, and loses what was said', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(
    `insert into appointments
       (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status,
        cancelled_by, cancel_reason, reason, summary)
     values ($1, $2, 'Ana Torres', '+351910523903', now() - interval '200 days', 'cancelada',
             'paciente', 'Ficou retida no trabalho', 'Limpeza', 'Pediu para remarcar')`,
    [CLINIC, p]
  )

  const { rows: report } = await db.query(`select purge_appointments() as r`)
  assert.equal(report[0].r.reasons_cleared, 1)
  assert.equal(report[0].r.summaries_cleared, 1)

  const { rows } = await db.query(
    `select patient_name, patient_phone, status, cancelled_by, cancel_reason, reason, summary
       from appointments where clinic_id = $1`,
    [CLINIC]
  )
  const a = rows[0]
  // Who, when, what happened and who called it off: the clinic's own record.
  assert.equal(a.patient_name, 'Ana Torres', 'the name was taken off a cancellation')
  assert.equal(a.patient_phone, '+351910523903')
  assert.equal(a.status, 'cancelada')
  assert.equal(a.cancelled_by, 'paciente')
  assert.equal(a.cancel_reason, 'Ficou retida no trabalho')
  // What she said about her health: gone at ninety days, like everywhere else.
  assert.equal(a.reason, null)
  assert.equal(a.summary, null)
})

test('an appointment that happened loses its note at the same age', async () => {
  // The hole 0051 closes: `calls.summary` has had a ninety day deadline since
  // 0039 and the appointment's copy of the same sentences had none.
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status, summary)
     values ($1, $2, 'Ana Torres', '+351910523903', now() - interval '200 days', 'copiada', 'Dor do lado direito')`,
    [CLINIC, p]
  )
  await db.query(`select purge_appointments()`)
  const { rows } = await db.query(
    `select patient_name, summary from appointments where clinic_id = $1`, [CLINIC]
  )
  assert.equal(rows[0].patient_name, 'Ana Torres')
  assert.equal(rows[0].summary, null)
})

test.after(() => db.close())
