#!/usr/bin/env node
//
// The diary, run against a real Postgres.
//
//   npm run test:agenda
//
// `available_slots` is the one piece of this system with nowhere to hide. It
// decides what Telma offers out loud, it is two hundred lines of SQL, and until
// now it was changed by reading it carefully and hoping: there is no Docker on
// this machine and no local Postgres, so migrations were pasted into Supabase
// and found out about in production. A clinic offered nine in the morning at
// half past eight at night before anybody noticed.
//
// pglite is Postgres compiled to WebAssembly. It runs the actual migrations,
// the actual function, and the actual planner, in memory, in about a second.
// Nothing is mocked, so a query that passes here is a query Postgres accepts.
//
// What it does not cover: RLS (the policies need Supabase's auth schema, which
// is stubbed below), and the pooler.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(here, '..', 'supabase', 'migrations')

const CLINIC = '11111111-1111-1111-1111-111111111111'

/** A database with every migration applied, exactly as Supabase would have. */
async function freshDatabase() {
  const db = new PGlite()

  // Supabase ships these; pglite does not. Stubbed rather than skipped, so the
  // migrations run unedited and a migration that references auth still fails
  // here if it references it wrongly.
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select null::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select 'service_role'::text
    $$;
    do $$ begin
      create role anon;      exception when duplicate_object then null; end $$;
    do $$ begin
      create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin
      create role service_role;  exception when duplicate_object then null; end $$;

    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text, public boolean default false
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text, owner uuid
    );
    create or replace function storage.foldername(name text)
      returns text[] language sql immutable as $fn$
      select string_to_array(name, '/')
    $fn$;
  `)

  // Realtime's publication. Supabase creates it for you; the migrations add
  // tables to it, so without this 0002 stops the whole run.
  await db.exec(`create publication supabase_realtime;`).catch(() => {})

  // A migration that refuses to run without data. 0010 makes the internal
  // account unique and stops the run rather than leave nobody able to log in,
  // which is right in production and needs the account to exist first here.
  const PRELUDE = {
    // A clinic seeing people for thirty minutes and starting one every
    // fifteen. Its rows overlap, which is what 0035 could not merge.
    '0038_merge_overlapping_windows.sql': `
      insert into clinics (id, name, timezone, selected_languages, appointment_duration_minutes)
      values ('44444444-4444-4444-4444-444444444444', 'Clínica Solapada', 'Europe/Madrid', array['es'], 30);
      insert into availability_slots (clinic_id, resource_id, weekday, start_time, end_time, capacity, active)
      select '44444444-4444-4444-4444-444444444444', r.id, 1, v.s::time, v.e::time, 1, true
        from resources r, (values
      ('09:00:00','09:30:00'),
      ('09:15:00','09:45:00'),
      ('09:30:00','10:00:00'),
      ('09:45:00','10:15:00'),
      ('10:00:00','10:30:00'),
      ('10:15:00','10:45:00'),
      ('10:30:00','11:00:00'),
      ('10:45:00','11:15:00'),
      ('11:00:00','11:30:00'),
      ('11:15:00','11:45:00'),
      ('11:30:00','12:00:00'),
      ('11:45:00','12:15:00')
        ) as v(s, e)
       where r.clinic_id = '44444444-4444-4444-4444-444444444444';
    `,
    // A clinic as the sign-up used to leave it: one row per bookable start,
    // with a break in the middle. 0035 has to turn this back into the two
    // windows it came from without changing a single offered time.
    '0035_merge_slots_into_windows.sql': `
      insert into clinics (id, name, timezone, selected_languages, appointment_duration_minutes)
      values ('33333333-3333-3333-3333-333333333333', 'Clínica Explotada', 'Europe/Madrid', array['es'], 30);
      insert into availability_slots (clinic_id, resource_id, weekday, start_time, end_time, capacity, active)
      select '33333333-3333-3333-3333-333333333333', r.id, 1, v.s::time, v.e::time, 1, true
        from resources r, (values
      ('09:00:00','09:30:00'),
      ('09:30:00','10:00:00'),
      ('10:00:00','10:30:00'),
      ('10:30:00','11:00:00'),
      ('11:00:00','11:30:00'),
      ('11:30:00','12:00:00'),
      ('12:00:00','12:30:00'),
      ('15:00:00','15:30:00'),
      ('15:30:00','16:00:00')
        ) as v(s, e)
       where r.clinic_id = '33333333-3333-3333-3333-333333333333';
    `,
    '0010_one_admin.sql': `
      insert into auth.users (id, email)
      values ('00000000-0000-0000-0000-0000000000aa', 'info@bwebstudio.com')
      on conflict do nothing;
      insert into users (id, email, full_name, role)
      values ('00000000-0000-0000-0000-0000000000aa', 'info@bwebstudio.com', 'Interno', 'interno')
      on conflict do nothing;
    `,
  }

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (PRELUDE[f]) await db.exec(PRELUDE[f])
    // `create extension pgcrypto` is the one line that cannot run here. It is
    // dropped rather than worked around because it buys nothing on any Postgres
    // this code targets: gen_random_uuid() has been core since version 13, and
    // Supabase is well past that. Nothing else is edited.
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8').replace(
      /create extension[^;]*pgcrypto[^;]*;/gi,
      ''
    )
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`${f}: ${e.message}`)
    }
  }
  return db
}

/**
 * A clinic with one window on one weekday.
 *
 * `day` is a real date so the weekday is real: a diary generated for the wrong
 * day of the week is the exact bug this is here to catch.
 */
async function clinicWith(db, { day, opens, closes, step = 60, duration = 30 }) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  await db.query(`delete from clinics where id = $1`, [CLINIC])
  await db.query(
    `insert into clinics (id, name, timezone, slot_minutes, appointment_duration_minutes, selected_languages)
     values ($1, 'Clínica de Prueba', 'Europe/Madrid', $2, $3, array['es'])`,
    [CLINIC, step, duration]
  )
  const { rows } = await db.query(`select id from resources where clinic_id = $1`, [CLINIC])
  let resource = rows[0]?.id
  if (!resource) {
    const r = await db.query(
      `insert into resources (clinic_id, name) values ($1, 'Clínica de Prueba') returning id`,
      [CLINIC]
    )
    resource = r.rows[0].id
  }
  await db.query(
    `insert into availability_slots (clinic_id, resource_id, weekday, start_time, end_time)
     values ($1, $2, $3, $4, $5)`,
    [CLINIC, resource, weekday, opens, closes]
  )
  return resource
}

/** The hours a caller would be offered, as they would be said out loud. */
async function offered(db, day, duration = null) {
  const { rows } = await db.query(
    `select to_char(slot_start at time zone 'Europe/Madrid', 'HH24:MI') as t, remaining, resource_name
       from available_slots($1, $2::date, $3)`,
    [CLINIC, day, duration]
  )
  return rows
}

const MONDAY = '2026-08-17'

test('an hourly diary offers exactly the hours it did before', async () => {
  const db = await freshDatabase()
  await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '12:00', step: 60, duration: 60 })
  const times = (await offered(db, MONDAY)).map((r) => r.t)
  // The old model stored 09:00-10:00, 10:00-11:00, 11:00-12:00 as three rows and
  // offered three hours. One window plus a sixty minute step has to agree.
  assert.deepEqual(times, ['09:00', '10:00', '11:00'])
  await db.close()
})

test('a window that is not whole hours can be written down at all', async () => {
  const db = await freshDatabase()
  // The case the old grid could not express: toggleSlot only spoke in integers.
  await clinicWith(db, { day: MONDAY, opens: '15:00', closes: '21:45', step: 45, duration: 45 })
  const times = (await offered(db, MONDAY)).map((r) => r.t)
  assert.equal(times[0], '15:00')
  assert.equal(times.at(-1), '21:00', 'the last start must leave room to finish by 21:45')
  assert.ok(times.includes('15:45'))
  await db.close()
})

test('a long service is not offered at a time it cannot finish', async () => {
  const db = await freshDatabase()
  await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '10:30', step: 30, duration: 30 })

  const short = (await offered(db, MONDAY, 30)).map((r) => r.t)
  assert.deepEqual(short, ['09:00', '09:30', '10:00'])

  // Ninety minutes of laser only fits once in a ninety minute window, and the
  // whole point of this change is that the diary knows that.
  const long = (await offered(db, MONDAY, 90)).map((r) => r.t)
  assert.deepEqual(long, ['09:00'])
  await db.close()
})

test('an appointment blocks the time it actually occupies, not just its start', async () => {
  const db = await freshDatabase()
  const resource = await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '12:00', step: 30, duration: 30 })

  await db.query(
    `insert into appointments (clinic_id, resource_id, patient_name, patient_phone, scheduled_at, duration_minutes)
     values ($1, $2, 'Ana', '+34600000000', ($3::date + time '10:00') at time zone 'Europe/Madrid', 60)`,
    [CLINIC, resource, MONDAY]
  )

  const times = (await offered(db, MONDAY, 30)).map((r) => r.t)
  assert.ok(!times.includes('10:00'), 'the hour itself is taken')
  // This is the one the equality test could never catch, because nothing used
  // to start at half past.
  assert.ok(!times.includes('10:30'), 'the second half of a long appointment is taken too')
  assert.ok(times.includes('11:00'), 'and it is free again afterwards')
  await db.close()
})

test('a second professional is a second diary, not more capacity', async () => {
  const db = await freshDatabase()
  const first = await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '11:00', step: 60, duration: 60 })
  const second = (
    await db.query(
      `insert into resources (clinic_id, name) values ($1, 'Dra. Ruiz') returning id`,
      [CLINIC]
    )
  ).rows[0].id
  await db.query(
    `insert into availability_slots (clinic_id, resource_id, weekday, start_time, end_time)
     values ($1, $2, $3, '09:00', '11:00')`,
    [CLINIC, second, new Date(`${MONDAY}T12:00:00Z`).getUTCDay()]
  )

  const all = await offered(db, MONDAY, 60)
  assert.equal(all.length, 4, 'two diaries, two hours each')

  // Booking one of them must leave the other alone, which the old unique key on
  // (clinic, weekday, start_time) could not have expressed.
  await db.query(
    `insert into appointments (clinic_id, resource_id, patient_name, patient_phone, scheduled_at, duration_minutes)
     values ($1, $2, 'Ana', '+34600000000', ($3::date + time '09:00') at time zone 'Europe/Madrid', 60)`,
    [CLINIC, first, MONDAY]
  )
  const left = await offered(db, MONDAY, 60)
  const nine = left.filter((r) => r.t === '09:00')
  assert.equal(nine.length, 1, 'nine is gone for one of them and still there for the other')
  assert.equal(nine[0].resource_name, 'Dra. Ruiz')
  await db.close()
})

test('a blocked day offers nothing at all', async () => {
  const db = await freshDatabase()
  await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '12:00' })
  await db.query(`insert into blocked_days (clinic_id, day, reason) values ($1, $2, 'Feriado')`, [
    CLINIC,
    MONDAY,
  ])
  assert.deepEqual(await offered(db, MONDAY), [])
  await db.close()
})

test('holding an hour takes it out of the diary, and only in one diary', async () => {
  const db = await freshDatabase()
  await clinicWith(db, { day: MONDAY, opens: '09:00', closes: '11:00', step: 60, duration: 60 })
  const start = `${MONDAY}T09:00:00+02:00`

  await db.query(`select hold_slot($1, $2::timestamptz, 'call-1')`, [CLINIC, start])
  const times = (await offered(db, MONDAY, 60)).map((r) => r.t)
  assert.ok(!times.includes('09:00'), 'a held hour is not offered to the next caller')

  await assert.rejects(
    () => db.query(`select hold_slot($1, $2::timestamptz, 'call-2')`, [CLINIC, start]),
    /slot_not_available|slot_locked/,
    'the same hour cannot be held twice'
  )
  await db.close()
})

// Four places create a clinic and none of them knew about diaries until today.
// A clinic without one saves its hours, shows them ticked, and offers nothing.
test('a clinic is born with a diary, without anybody remembering to make one', async () => {
  const db = await freshDatabase()
  const id = '22222222-2222-2222-2222-222222222222'
  await db.query(
    `insert into clinics (id, name, timezone, selected_languages)
     values ($1, 'Clínica Nueva', 'Europe/Lisbon', array['pt'])`,
    [id]
  )
  const { rows } = await db.query(`select name from resources where clinic_id = $1`, [id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Clínica Nueva')
  await db.close()
})

// The migration that has to change nothing visible.
//
// Clinics signed up before 0034 have one row per bookable start. Read as
// windows those still work, but a thirty minute window has no room for a
// forty-five minute service, so every long treatment would offer nothing at
// all, on every day, with the hours sitting there ticked and correct.
test('merging exploded rows into windows offers exactly the same times', async () => {
  const db = await freshDatabase()
  const OLD = '33333333-3333-3333-3333-333333333333'

  const { rows: windows } = await db.query(
    `select to_char(start_time, 'HH24:MI') as s, to_char(end_time, 'HH24:MI') as e
       from availability_slots where clinic_id = $1 order by start_time`,
    [OLD]
  )
  // Nine rows became two: the morning and the afternoon, with the break as the
  // gap between them rather than as an absence of rows.
  assert.deepEqual(
    windows.map((w) => `${w.s}-${w.e}`),
    ['09:00-12:30', '15:00-16:00']
  )

  const { rows: step } = await db.query(`select slot_minutes from clinics where id = $1`, [OLD])
  assert.equal(step[0].slot_minutes, 30, 'the step is read off the data, not guessed')

  const { rows: offered } = await db.query(
    `select to_char(slot_start at time zone 'Europe/Madrid', 'HH24:MI') as t
       from available_slots($1, $2::date) order by slot_start`,
    [OLD, MONDAY]
  )
  // The list the exploded rows produced, to the minute.
  assert.deepEqual(
    offered.map((r) => r.t),
    ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '15:00', '15:30']
  )
  await db.close()
})

// The rows 0035 could not see.
//
// Appointments of thirty minutes starting every fifteen overlap each other, and
// a merge that only joined rows meeting end-to-end joined none of them. The
// clinic opened its hours screen to forty rows for one Monday, which is the
// exact thing the merge exists to prevent, and nothing anywhere said so.
test('overlapping rows merge too, and still offer the same times', async () => {
  const db = await freshDatabase()
  const OVERLAP = '44444444-4444-4444-4444-444444444444'

  const { rows: windows } = await db.query(
    `select to_char(start_time, 'HH24:MI') as s, to_char(end_time, 'HH24:MI') as e
       from availability_slots where clinic_id = $1 order by start_time`,
    [OVERLAP]
  )
  assert.deepEqual(windows.map((w) => `${w.s}-${w.e}`), ['09:00-12:15'])

  const { rows: step } = await db.query(`select slot_minutes from clinics where id = $1`, [OVERLAP])
  assert.equal(step[0].slot_minutes, 15)

  const { rows: offered } = await db.query(
    `select to_char(slot_start at time zone 'Europe/Madrid', 'HH24:MI') as t
       from available_slots($1, $2::date) order by slot_start`,
    [OVERLAP, MONDAY]
  )
  // Every quarter of an hour from nine, last start leaving room to finish.
  assert.equal(offered.length, 12)
  assert.equal(offered[0].t, '09:00')
  assert.equal(offered.at(-1).t, '11:45')
  await db.close()
})

// Two implementations of one rule, checked against each other.
//
// The SQL is the one that decides: it is what a caller is offered from. The
// TypeScript copy exists so the panel can draw six weeks without a round trip
// per day. Nothing forces them to agree, so this does: if they drift, the panel
// is wrong about how full a Thursday looks, which is the sort of thing that
// gets noticed months later and blamed on the diary.
test('the panel generates the same times the diary does', async () => {
  const { startsIn } = await import('../lib/slots.ts')
  const db = await freshDatabase()

  for (const [opens, closes, step, duration] of [
    ['09:00', '19:00', 60, 60],
    ['15:00', '21:45', 45, 45],
    ['09:00', '13:00', 15, 30],
    ['08:30', '14:00', 20, 40],
  ]) {
    await db.query(`delete from availability_slots where clinic_id = $1`, [CLINIC])
    await clinicWith(db, { day: MONDAY, opens, closes, step, duration })

    const { rows } = await db.query(
      `select to_char(slot_start at time zone 'Europe/Madrid', 'HH24:MI') as t
         from available_slots($1, $2::date, $3) order by slot_start`,
      [CLINIC, MONDAY, duration]
    )
    assert.deepEqual(
      startsIn([{ start_time: opens, end_time: closes }], step, duration),
      rows.map((r) => r.t),
      `${opens}-${closes} every ${step} for ${duration}`
    )
  }
  await db.close()
})
