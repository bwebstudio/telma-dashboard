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

test.after(() => db.close())
