-- Empty a clinic's history without touching how it is set up.
--
-- For a demo you want to run again from nothing: the calls and the bookings go,
-- the opening hours, services, prices, diaries and everything from the sign-up
-- stay. Run it in the Supabase SQL editor of the project the clinic lives in.
--
-- ── READ THIS FIRST ────────────────────────────────────────────────────────
-- There is no undo. Run part 1 on its own, look at what it prints, and only
-- then run part 2. One clinic should come back; if two do, or none, stop and
-- narrow the name rather than running it anyway.
--
-- Change the name on the next line and nowhere else.

-- ── 1. What is about to be deleted ─────────────────────────────────────────
with target as (
  select id, name from clinics where name ilike 'Clinica Spooky'
)
select t.name,
       t.id as clinic_id,
       (select count(*) from calls        c where c.clinic_id = t.id) as chamadas,
       (select count(*) from appointments a where a.clinic_id = t.id) as marcacoes,
       (select count(*) from activity_log l where l.clinic_id = t.id) as registos,
       (select count(*) from slot_locks   s where s.clinic_id = t.id) as reservas_temporarias
  from target t;

-- ── 2. The deletion ────────────────────────────────────────────────────────
-- Everything in one transaction: a half-emptied clinic, with bookings whose
-- calls are gone, is worse to look at than either state.
begin;

with target as (
  select id from clinics where name ilike 'Clinica Spooky'
)
delete from appointments where clinic_id in (select id from target);

with target as (
  select id from clinics where name ilike 'Clinica Spooky'
)
delete from calls where clinic_id in (select id from target);

-- The panel's activity feed. Left behind it would still announce calls and
-- bookings that no longer exist anywhere.
with target as (
  select id from clinics where name ilike 'Clinica Spooky'
)
delete from activity_log where clinic_id in (select id from target);

-- Hours held mid-call and never released. Not visible anywhere, and each one
-- keeps its hour out of the diary until it expires.
with target as (
  select id from clinics where name ilike 'Clinica Spooky'
)
delete from slot_locks where clinic_id in (select id from target);

commit;

-- ── 3. Optional: the meter as well ─────────────────────────────────────────
-- Minutes consumed and calls counted this month. Separate because it is the
-- billing side rather than the history, and because a demo about how much a
-- plan includes may want to keep it. Uncomment to run.
--
-- begin;
-- with target as (
--   select id from clinics where name ilike 'Clinica Spooky'
-- )
-- delete from usage where clinic_id in (select id from target);
-- with target as (
--   select id from clinics where name ilike 'Clinica Spooky'
-- )
-- delete from usage_metrics where clinic_id in (select id from target);
-- commit;

-- ── What this does NOT touch ───────────────────────────────────────────────
-- clinics, users, availability_slots, blocked_days, resources, purchases.
-- The clinic keeps its hours, its diaries, its services and its prices, so the
-- next test starts from a configured clinic with an empty history, which is the
-- point. To start from an unconfigured one, sign up again instead.
