-- Diaries that can hold more than one person, and services that take longer
-- than the others.
--
-- Two changes that look separate and are the same change.
--
-- Until now a row in `availability_slots` WAS a bookable hour: `toggleSlot`
-- wrote 09:00 to 10:00 and the diary offered exactly that. Three consequences,
-- all of them things a real clinic asks for on the first day:
--
--   * A window of 15:00 to 21:45 could not be written down at all. The grid
--     only understood whole hours, so half past anything was unreachable.
--   * `appointment_duration_minutes` was decoration. The base told Telma that a
--     consultation takes thirty minutes while the diary handed her whole hours,
--     and nothing anywhere reconciled the two.
--   * A clinic with two dentists had one diary. Two people cannot be booked at
--     the same time except by raising `capacity`, which says how many fit but
--     not who they are, so the panel could never show whose appointment it was.
--
-- So a row becomes a WINDOW that belongs to somebody, and the bookable times
-- are generated from it: step through the window by `slot_minutes`, and offer a
-- start only if the whole service fits before the window closes.
--
-- ── NOTHING CHANGES FOR ANYBODY TODAY ──────────────────────────────────────
-- `slot_minutes` is backfilled to 60 and every existing row is exactly one hour
-- long, so stepping through a window yields the single hour it already yielded.
-- Live clinics keep the diary they have until somebody edits it.
--
-- ── ONE RESOURCE, ALWAYS ───────────────────────────────────────────────────
-- Every clinic gets exactly one resource here, named after itself. A clinic run
-- by one person never sees the word "resource" and never chooses anything: it
-- has one diary because it has one row, not because it ticked a box. The panel
-- shows the machinery only once a second row exists, which is an act the client
-- understands (adding a colleague) rather than a setting they have to find.

-- Who a diary belongs to ------------------------------------------------------
create table if not exists resources (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  -- A room and a laser are diaries too: two treatments needing the same machine
  -- cannot run at once, however many people are free.
  kind       text not null default 'profissional'
             check (kind in ('profissional', 'sala', 'equipamento')),
  active     boolean not null default true,
  sort       smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_resources_clinic on resources(clinic_id);

-- The one every existing clinic already had without knowing it.
insert into resources (clinic_id, name, kind)
select c.id, c.name, 'profissional'
  from clinics c
 where not exists (select 1 from resources r where r.clinic_id = c.id);

-- And every clinic created from now on, without anybody remembering to.
--
-- A trigger rather than a line in the sign-up, because there are four places
-- that create a clinic (sign-up, the seed, the demo seeder, the showcase) and a
-- clinic with no diary is invisible rather than broken: its hours save, they
-- show as ticked in the panel, and no caller is ever offered one of them.
create or replace function clinic_default_resource() returns trigger
language plpgsql as $$
begin
  insert into resources (clinic_id, name, kind) values (new.id, new.name, 'profissional');
  return new;
end $$;

drop trigger if exists trg_clinic_default_resource on clinics;
create trigger trg_clinic_default_resource
  after insert on clinics
  for each row execute function clinic_default_resource();

-- Which services each diary can take. An empty set means "everything this
-- clinic offers", which is what one-person clinics want and never configure.
create table if not exists resource_services (
  resource_id uuid not null references resources(id) on delete cascade,
  service_id  text not null,
  primary key (resource_id, service_id)
);

-- Windows belong to a diary ---------------------------------------------------
alter table availability_slots add column if not exists resource_id uuid
  references resources(id) on delete cascade;

update availability_slots s
   set resource_id = r.id
  from resources r
 where r.clinic_id = s.clinic_id
   and s.resource_id is null;

-- Two dentists open at nine on the same Monday, so the old key is now wrong: it
-- allowed one 09:00 per clinic per weekday and would refuse the second diary.
alter table availability_slots drop constraint if exists availability_slots_clinic_id_weekday_start_time_key;
create unique index if not exists idx_slots_resource_weekday_start
  on availability_slots(resource_id, weekday, start_time);

-- Appointments belong to one too, and know how long they are ------------------
alter table appointments add column if not exists resource_id uuid
  references resources(id) on delete set null;
alter table appointments add column if not exists duration_minutes smallint;

-- Backfilled to the hour they were booked into, not to the clinic's nominal
-- appointment length: these were made when a slot was an hour, and an existing
-- booking has to keep blocking exactly what it blocked yesterday.
update appointments set duration_minutes = 60 where duration_minutes is null;

update appointments a
   set resource_id = r.id
  from resources r
 where r.clinic_id = a.clinic_id
   and a.resource_id is null;

-- A hold is against one diary ------------------------------------------------
-- Without this, one caller holding ten o'clock would trip the unique key and
-- lock out the other dentist, who is sitting there free.
alter table slot_locks add column if not exists resource_id uuid
  references resources(id) on delete cascade;

update slot_locks l
   set resource_id = r.id
  from resources r
 where r.clinic_id = l.clinic_id
   and l.resource_id is null;

alter table slot_locks drop constraint if exists slot_locks_clinic_id_slot_start_key;
create unique index if not exists idx_locks_resource_slot
  on slot_locks(resource_id, slot_start);

-- How the grid is cut, and what each service costs ---------------------------
alter table clinics add column if not exists slot_minutes smallint not null default 60
  check (slot_minutes between 5 and 240);

-- { "<service id>": <minutes> }. A service that is absent takes the clinic's
-- default length, so a clinic that never opens this screen behaves as it does
-- now and nobody is forced to fill in a table of numbers to get started.
alter table clinics add column if not exists service_durations jsonb not null default '{}'::jsonb;

-- The diary ------------------------------------------------------------------
-- Dropped rather than replaced: the returned row gains the diary it belongs to,
-- and Postgres will not change a function's return type in place.
drop function if exists available_slots(uuid, date);

create or replace function available_slots(
  p_clinic_id   uuid,
  p_date        date,
  -- How long the thing being booked takes. Null means the clinic's default,
  -- which is what every existing caller passes.
  p_duration    integer default null,
  -- Null means every diary in the clinic, which is the right answer to "what
  -- have you got on Thursday" when nobody asked for a particular person.
  p_resource_id uuid default null
)
returns table (
  slot_start    timestamptz,
  slot_end      time,
  remaining     integer,
  resource_id   uuid,
  resource_name text
)
language sql stable as $$
  with cfg as (
    select c.timezone,
           greatest(c.slot_minutes, 5) as step,
           greatest(coalesce(p_duration, c.appointment_duration_minutes, c.slot_minutes), 5) as dur
      from clinics c
     where c.id = p_clinic_id
  ),
  -- Every start the windows allow, before asking whether anyone is free. The
  -- series stops at `end - dur`, so a forty-five minute treatment is never
  -- offered at a time that would run past closing.
  candidates as (
    select r.id                                            as res_id,
           r.name                                          as res_name,
           s.capacity                                      as capacity,
           (gs.t at time zone cfg.timezone)                as starts_at,
           ((gs.t + make_interval(mins => cfg.dur))::time) as ends_at,
           cfg.dur                                         as dur
      from availability_slots s
      join resources r on r.id = s.resource_id
      cross join cfg
      cross join lateral generate_series(
        (p_date + s.start_time),
        (p_date + s.end_time) - make_interval(mins => cfg.dur),
        make_interval(mins => cfg.step)
      ) as gs(t)
     where s.clinic_id = p_clinic_id
       and s.active
       and r.active
       and (p_resource_id is null or r.id = p_resource_id)
       and s.weekday = extract(dow from p_date)::int
       and not exists (
         select 1 from blocked_days b
          where b.clinic_id = p_clinic_id and b.day = p_date
       )
  ),
  counted as (
    select c.starts_at,
           c.ends_at,
           c.res_id,
           c.res_name,
           (c.capacity - taken.appts - taken.locks)::integer as remaining
      from candidates c
      cross join lateral (
        select
          -- Overlap, not equality. An hour-long appointment at ten o'clock has
          -- to block half past ten as well, which an equality test on the start
          -- time never noticed, because until now nothing started at half past.
          coalesce((
            select count(*) from appointments a
             where a.clinic_id = p_clinic_id
               and (a.resource_id is null or a.resource_id = c.res_id)
               and a.status in ('pendente', 'confirmada', 'copiada')
               -- A pre-marcação past its deadline has let its hour go, whether
               -- or not anything has swept it yet. Same clause as 0020.
               and not (
                 a.status = 'pendente'
                 and a.expires_at is not null
                 and a.expires_at <= now()
               )
               and a.scheduled_at < c.starts_at + make_interval(mins => c.dur)
               and a.scheduled_at + make_interval(mins => coalesce(a.duration_minutes, 60)) > c.starts_at
          ), 0) as appts,
          coalesce((
            select count(*) from slot_locks l
             where l.clinic_id = p_clinic_id
               and (l.resource_id is null or l.resource_id = c.res_id)
               and l.expires_at > now()
               and l.slot_start < c.starts_at + make_interval(mins => c.dur)
               and l.slot_start + make_interval(mins => c.dur) > c.starts_at
          ), 0) as locks
      ) as taken
  )
  select starts_at, ends_at, remaining, res_id, res_name
    from counted
   where remaining > 0
   order by starts_at, res_name;
$$;

-- Holding an hour now means holding it in one diary --------------------------
-- The old three-argument version has to go before the new one arrives. Adding
-- defaulted parameters does not replace a function, it overloads it, and then
-- `hold_slot(clinic, time, ref)` matches both and Postgres refuses the call as
-- ambiguous. Telma would have lost the ability to hold an hour at all, which is
-- the step between offering a time and booking it.
drop function if exists hold_slot(uuid, timestamptz, text);

create or replace function hold_slot(
  p_clinic_id   uuid,
  p_slot_start  timestamptz,
  p_call_ref    text,
  p_duration    integer default null,
  p_resource_id uuid default null
)
returns slot_locks language plpgsql as $$
declare
  v_res uuid;
  v_row slot_locks;
begin
  delete from slot_locks where expires_at <= now();

  -- The first diary that is actually free at that hour, rather than the first
  -- that exists. With one resource this is the resource, as before.
  select resource_id into v_res
    from available_slots(p_clinic_id, p_slot_start::date, p_duration, p_resource_id)
   where slot_start = p_slot_start
   order by resource_name
   limit 1;

  if v_res is null then
    raise exception 'slot_not_available' using errcode = 'P0001';
  end if;

  insert into slot_locks (clinic_id, slot_start, call_ref, resource_id)
  values (p_clinic_id, p_slot_start, p_call_ref, v_res)
  returning * into v_row;

  return v_row;
exception when unique_violation then
  raise exception 'slot_locked' using errcode = 'P0001';
end $$;
