#!/usr/bin/env node
//
// A real Postgres, with every migration applied, in memory.
//
// Shared by test-agenda and test-recalls. It was written for the diary, and the
// reason it is worth sharing is the reason it was written: there is no Docker on
// this machine and no local Postgres, so before this existed a migration was
// changed by reading it carefully and hoping, then pasted into Supabase and
// found out about in production.
//
// pglite is Postgres compiled to WebAssembly. It runs the actual migrations, the
// actual functions and the actual planner. Nothing is mocked, so a statement
// that passes here is a statement Postgres accepts.
//
// What it does not cover: RLS (the policies need Supabase's auth schema, which
// is stubbed below), pg_cron, and the pooler.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

/** This module's own directory, which is scripts/lib. */
const here = dirname(fileURLToPath(import.meta.url))
/** Where the migrations are, from here. Exported because more than one test
 *  wants to read them as text rather than run them. */
export const MIGRATIONS = join(here, '..', '..', 'supabase', 'migrations')
/** The scripts directory, for tests reaching back into the application. */
export const SCRIPTS = join(here, '..')

export /** A database with every migration applied, exactly as Supabase would have. */
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
