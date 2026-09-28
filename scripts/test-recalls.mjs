#!/usr/bin/env node
//
// Reminders, run against a real Postgres.
//
//   npm run test:recalls
//
// This is the half of the feature that decides whether a real person receives a
// real message, so it is the half that cannot be checked by reading it. Every
// test below writes rows and reads back what the trigger did.
//
// The first one is the one that matters most. A clinic that has not asked for
// this must send nothing, and there is no symptom if that is wrong: the messages
// simply go out.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDatabase } from './lib/fresh-database.mjs'

const CLINIC = '77777777-7777-7777-7777-777777777777'
const OTHER = '88888888-8888-8888-8888-888888888888'

// ── THE DATES ───────────────────────────────────────────────────────────────
// Fixed, because a reminder six months out lands on a named weekday and the
// weekend rule cannot be tested against a date that moves. They have to be in
// the future: `schedule_recall` refuses to put a reminder in the past, so an
// appointment that has already happened comes out dated today and every
// assertion below turns into today's date. That is what THE DATES ARE STILL
// AHEAD is for, and it fails with an instruction rather than a puzzle.
const JAN = '2027-01-15T10:00:00Z'      // a Friday
const JAN_PLUS_6 = '2027-07-15'         // a Thursday, moved nowhere
const SAT = '2027-01-18T10:00:00Z'      // a Monday
const SAT_PLUS_6 = '2027-07-19'         // 18 July is a Sunday: this is Monday
const MAR = '2027-03-16T10:00:00Z'
const MAR_PLUS_6 = '2027-09-16'

const db = await freshDatabase()

/** A clinic, its reminder settings wiped and rewritten. */
async function clinic(id, { enabled = true, months = {}, timezone = 'Europe/Lisbon' } = {}) {
  await db.query(`delete from clinics where id = $1`, [id])
  await db.query(
    `insert into clinics (id, name, timezone, selected_languages, recalls_enabled, recall_months)
     values ($1, 'Clínica Sorriso', $2, array['pt'], $3, $4::jsonb)`,
    [id, timezone, enabled, JSON.stringify(months)]
  )
}

async function patient(clinicId, name, phone) {
  const { rows } = await db.query(`select remember_patient($1, $2, $3) as id`, [clinicId, name, phone])
  return rows[0].id
}

/** An appointment, at a status, for a service. Returns its id. */
async function appointment(clinicId, patientId, { at, service = null, status = 'pendente' }) {
  const { rows } = await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status, service_id)
     values ($1, $2, 'Ana Torres', '+351910523903', $3, $4, $5) returning id`,
    [clinicId, patientId, at, status, service]
  )
  return rows[0].id
}

async function recalls(clinicId = CLINIC) {
  const { rows } = await db.query(
    `select id, due_on::text as due_on, kind, state, service_id, source, appointment_id
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

// ── THE DEFAULT ─────────────────────────────────────────────────────────────

test('THE DATES ARE STILL AHEAD (move them on if this fails)', () => {
  assert.ok(
    new Date(JAN) > new Date(),
    'The fixed dates in this file are in the past, so every reminder below comes '
      + 'out dated today. Move all of them a year forward.'
  )
})

test('a clinic that has not turned it on sends nothing', async () => {
  await wipe()
  await clinic(CLINIC, { enabled: false, months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  assert.equal((await recalls()).length, 0)
})

test('recalls_enabled is false on a clinic nobody has touched', async () => {
  const { rows } = await db.query(
    `select column_default from information_schema.columns
      where table_name = 'clinics' and column_name = 'recalls_enabled'`
  )
  assert.match(rows[0].column_default, /false/)
})

// ── THE AUTOMATIC HALF ──────────────────────────────────────────────────────

test('an accepted appointment schedules the next one, in months', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  const [r] = await recalls()
  // 15 July 2027 is a Thursday, so nothing is moved.
  assert.equal(r.due_on, JAN_PLUS_6)
  assert.equal(r.service_id, 'dental_higiene')
  assert.equal(r.source, 'automatico')
  assert.equal(r.kind, 'aviso')
})

test('a service with no interval schedules nothing', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'estet_laser', status: 'confirmada' })
  assert.equal((await recalls()).length, 0)
})

test('a pre-marcação the clinic has not answered schedules nothing', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'pendente' })
  assert.equal((await recalls()).length, 0)
})

// The month is counted from the day the clinic's own calendar says, not UTC. A
// half past midnight appointment in Lisbon is the day before in UTC before the
// six months have even been added.
test('the date is counted in the clinic\'s timezone', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 }, timezone: 'Europe/Madrid' })
  const p = await patient(CLINIC, 'Ana Torres', '+34600000001')
  // 23:30 UTC on the 14th is 00:30 on the 15th in Madrid.
  await appointment(CLINIC, p, { at: '2027-01-14T23:30:00Z', service: 'dental_higiene', status: 'confirmada' })
  const [r] = await recalls()
  assert.equal(r.due_on, JAN_PLUS_6)
})

test('a reminder never lands on a Saturday or a Sunday', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  // 18 January 2027 + 6 months = 18 July 2027, a Sunday. Monday the 19th.
  await appointment(CLINIC, p, { at: SAT, service: 'dental_higiene', status: 'confirmada' })
  const [r] = await recalls()
  assert.equal(r.due_on, SAT_PLUS_6)
  const { rows } = await db.query(`select extract(isodow from $1::date) as d`, [r.due_on])
  assert.ok(Number(rows[0].d) <= 5, 'a message asking somebody to ring a shut clinic')
})

test('confirming and then copying is one acceptance, not two reminders', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const a = await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  await db.query(`update appointments set status = 'copiada' where id = $1`, [a])
  assert.equal((await recalls()).length, 1)
})

test('a second visit for the same thing moves the waiting reminder, later only', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  // They come back in March. The July reminder is wrong: it becomes September.
  await appointment(CLINIC, p, { at: MAR, service: 'dental_higiene', status: 'confirmada' })
  let all = await recalls()
  assert.equal(all.length, 1, 'told twice about the same treatment')
  assert.equal(all[0].due_on, MAR_PLUS_6)

  // And an older appointment accepted late cannot pull it forward.
  await appointment(CLINIC, p, { at: '2026-12-01T10:00:00Z', service: 'dental_higiene', status: 'confirmada' })
  all = await recalls()
  assert.equal(all.length, 1)
  assert.equal(all[0].due_on, MAR_PLUS_6)
})

test('two different treatments are two reminders', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6, dental_ortodontia: 3 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  await appointment(CLINIC, p, { at: JAN.replace('10:00', '11:00'), service: 'dental_ortodontia', status: 'confirmada' })
  assert.equal((await recalls()).length, 2)
})

test('a booking that stops being one takes its reminder with it', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const a = await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  assert.equal((await recalls()).length, 1)
  await db.query(`update appointments set status = 'cancelada' where id = $1`, [a])
  assert.equal((await recalls()).length, 0)
})

test('cancelling a booking does not touch a reminder somebody set by hand', async () => {
  await wipe()
  await clinic(CLINIC, { months: {} })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const a = await appointment(CLINIC, p, { at: JAN, status: 'confirmada' })
  await db.query(
    `select schedule_recall($1, $2, $3::date, 'aviso', null, 'revisão 3 meses após a cirurgia')`,
    [CLINIC, p, '2027-04-15']
  )
  await db.query(`update appointments set status = 'cancelada' where id = $1`, [a])
  const all = await recalls()
  assert.equal(all.length, 1)
  assert.equal(all[0].source, 'manual')
})

// ── SETTING ONE BY HAND ─────────────────────────────────────────────────────

test('a date in the past means today', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(`select schedule_recall($1, $2, '2020-01-01'::date)`, [CLINIC, p])
  const { rows } = await db.query(
    `select due_on >= current_date as not_past from patient_recalls where clinic_id = $1`,
    [CLINIC]
  )
  assert.equal(rows[0].not_past, true)
})

test('a clinic cannot put a reminder on another clinic\'s patient', async () => {
  await wipe()
  await clinic(CLINIC)
  await clinic(OTHER)
  const mine = await patient(OTHER, 'Ana Torres', '+351910523903')
  const { rows } = await db.query(`select schedule_recall($1, $2, '2028-01-04'::date) as id`, [CLINIC, mine])
  assert.equal(rows[0].id, null)
  assert.equal((await recalls()).length, 0)
})

// ── FORGETTING ──────────────────────────────────────────────────────────────

test('erasing a person removes the record and every waiting reminder', async () => {
  await wipe()
  await clinic(CLINIC, { months: { dental_higiene: 6 } })
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await appointment(CLINIC, p, { at: JAN, service: 'dental_higiene', status: 'confirmada' })
  assert.equal((await recalls()).length, 1)

  const { rows } = await db.query(`select erase_patient($1, $2) as r`, [CLINIC, '910523903'])
  assert.equal(rows[0].r.recalls_cancelled, 1)
  assert.equal((await recalls()).length, 0)

  const left = await db.query(`select count(*)::int as n from patients where clinic_id = $1`, [CLINIC])
  assert.equal(left.rows[0].n, 0, 'the name is still in the record after an erasure')

  // And the appointment survives, with nobody in it: the clinic's record of an
  // hour it worked, which is not the patient's to erase.
  const appt = await db.query(
    `select patient_name, patient_phone, service_id from appointments where clinic_id = $1`,
    [CLINIC]
  )
  assert.equal(appt.rows[0].patient_name, 'Apagado a pedido')
  assert.equal(appt.rows[0].patient_phone, '')
  assert.equal(appt.rows[0].service_id, null)
})

test('the purge drops what is spent and keeps what is waiting', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  const waiting = await db.query(
    `select schedule_recall($1, $2, (current_date + 30)::date) as id`, [CLINIC, p]
  )
  // Sent thirteen months ago, and one waiting that came due two months back.
  await db.query(
    `insert into patient_recalls (clinic_id, patient_id, due_on, state, sent_at)
     values ($1, $2, current_date - 400, 'enviado', now() - interval '13 months')`,
    [CLINIC, p]
  )
  await db.query(
    `insert into patient_recalls (clinic_id, patient_id, due_on, state, source)
     values ($1, $2, current_date - 70, 'agendado', 'manual')`,
    [CLINIC, p]
  )
  const { rows } = await db.query(`select purge_recalls() as r`)
  assert.equal(rows[0].r.recalls_expired, 1)
  assert.equal(rows[0].r.recalls_stale, 1)

  const left = await recalls()
  assert.equal(left.length, 1)
  assert.equal(left[0].id, waiting.rows[0].id)
})

test('the service dies with the reason, at ninety days', async () => {
  await wipe()
  await clinic(CLINIC)
  const p = await patient(CLINIC, 'Ana Torres', '+351910523903')
  await db.query(
    `insert into appointments (clinic_id, patient_id, patient_name, patient_phone, scheduled_at, status, service_id, reason)
     values ($1, $2, 'Ana Torres', '+351910523903', now() - interval '100 days', 'copiada', 'dental_higiene', 'limpeza')`,
    [CLINIC, p]
  )
  await db.query(`select purge_appointments()`)
  await db.query(`select purge_recalls()`)
  const { rows } = await db.query(`select reason, service_id from appointments where clinic_id = $1`, [CLINIC])
  assert.equal(rows[0].reason, null)
  assert.equal(rows[0].service_id, null, 'the treatment outlived the reason it came from')
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
  await db.query(`select schedule_recall($1, $2, (current_date + 10)::date)`, [CLINIC, stale])

  const { rows } = await db.query(`select purge_recalls() as r`)
  assert.equal(rows[0].r.patients_forgotten, 1)
  const left = await db.query(`select id from patients where clinic_id = $1 order by name`, [CLINIC])
  assert.deepEqual(left.rows.map((r) => r.id).sort(), [recent, stale].sort())
})

test.after(() => db.close())
