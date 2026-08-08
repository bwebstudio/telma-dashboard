-- Thirty minutes to answer, and then the hour goes back on sale.
--
-- A pre-marcação already held its slot: available_slots has counted 'pendente'
-- as occupying since 0003. What it held it for was forever. A booking nobody
-- confirmed sat on a Tuesday at ten for the rest of the month, and Telma could
-- not offer that hour to the next patient who asked for it. So the hold now has
-- an end, and the panel can show the clinic how long is left of it.
--
-- Two different things in this system are called a hold, and only one of them
-- changes here:
--
--   slot_locks  the three minutes while Telma is on the phone reading a time
--               back to a patient. Three minutes is the length of that
--               sentence, and it stays three minutes: a caller who hangs up
--               mid-word must not sit on an hour for half the morning.
--
--   the pre-marcação  the booking waiting for the clinic to say yes. That is
--               the one that now lasts thirty minutes, because thirty minutes
--               is roughly how long a receptionist can be away from the screen
--               and still be said to be answering.
--
-- The slot is covered for the whole window either way: the lock carries it
-- through the call, and the pre-marcação carries it from there.

-- When this pre-marcação stops holding its hour ---------------------------
-- Only meaningful while the status is 'pendente'; null on everything else, and
-- null on the pre-marcações that already existed. Those predate the rule and
-- expiring them retroactively would empty an agenda somebody has been working
-- through this morning.
alter table appointments add column if not exists expires_at timestamptz;

comment on column appointments.expires_at is
  'When a pendente pre-marcação stops holding its slot. Null means no deadline.';

-- The sweeper's query, and the panel's: this clinic's pre-marcações with a
-- deadline. Partial, because every other row in the table has none.
create index if not exists idx_appts_expiring
  on appointments(clinic_id, expires_at)
  where status = 'pendente' and expires_at is not null;

-- The deadline is set where the row is written -----------------------------
-- A trigger rather than a default or a line in record_call, because there are
-- already three writers (the voice webhook, POST /api/appointments, the
-- simulator) and the next one would have to remember. Here nobody has to.
--
-- It also clears the deadline the moment the status moves on, so the column
-- keeps meaning exactly one thing: when this pre-marcação lapses.
-- Whether there is a deadline at all is the clinic's own setting, read here
-- rather than decided here: one place writes expires_at, so one place has to
-- know. A clinic that waits for a person gets null, which every reader already
-- treats as "no deadline" — the countdown draws nothing, the sweep skips it,
-- and available_slots keeps the hour held.
create or replace function set_preappointment_expiry()
returns trigger language plpgsql as $$
declare
  v_auto boolean;
begin
  if new.status = 'pendente' then
    -- Only on the way in. An update that touches the status of a booking that
    -- was already pendente must not restart a clock the clinic is watching.
    if new.expires_at is null and tg_op = 'INSERT' then
      select pre_appointment_auto_expires into v_auto
        from clinics where id = new.clinic_id;

      if coalesce(v_auto, true) then
        new.expires_at := now() + interval '30 minutes';
      end if;
    end if;
  else
    -- Answered, so there is nothing left to count. Keeps the column meaning
    -- exactly one thing: when this pre-marcação lapses.
    new.expires_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_appts_expiry on appointments;
create trigger trg_appts_expiry before insert or update of status on appointments
  for each row execute function set_preappointment_expiry();

-- Sweeping the lapsed ones -------------------------------------------------
-- Marks what the deadline already decided. Scoped to one clinic when asked,
-- because the panel calls it for its own clinic the moment a counter on screen
-- reaches zero, and a whole table sweep is not that clinic's business.
--
-- Returns how many it moved, so a caller can tell "nothing had lapsed" from
-- "the sweep did not run".
create or replace function expire_stale_preappointments(p_clinic_id uuid default null)
returns integer language plpgsql as $$
declare
  v_count integer;
begin
  with lapsed as (
    update appointments
       set status = 'expirada'
     where status = 'pendente'
       and expires_at is not null
       and expires_at <= now()
       and (p_clinic_id is null or clinic_id = p_clinic_id)
    returning clinic_id, patient_name
  )
  select count(*) into v_count from lapsed;

  return coalesce(v_count, 0);
end $$;

revoke execute on function expire_stale_preappointments(uuid) from public;
grant execute on function expire_stale_preappointments(uuid) to service_role;

-- Run it on a timer if this database has one. Supabase enables pg_cron on
-- request and it may not be on here, so this is allowed to fail: the sweep is
-- bookkeeping, not what makes the rule true, and a database without cron is
-- not a broken one. `when others` is deliberately blunt because there are
-- three different ways a missing extension reports itself and none of them
-- should stop the migration.
do $$ begin
  perform cron.schedule(
    'expire-stale-preappointments',
    '* * * * *',
    $cron$select expire_stale_preappointments()$cron$
  );
exception when others then
  raise notice 'pg_cron not available: expiry sweep runs from the app instead';
end $$;

-- Which hours are free -----------------------------------------------------
-- Same query as 0003 with one clause added: a pre-marcação past its deadline
-- does not occupy anything, whether or not the sweeper has reached it yet.
--
-- That clause is what makes the rule true rather than merely scheduled. The
-- sweep is bookkeeping, so the agenda reads correctly; this is correctness, so
-- Telma never withholds an hour that is actually free.
create or replace function available_slots(p_clinic_id uuid, p_date date)
returns table (slot_start timestamptz, slot_end time, remaining integer)
language sql stable as $$
  select t.slot_start, t.slot_end, t.remaining
  from (
    select
      (p_date + s.start_time)::timestamptz as slot_start,
      s.end_time as slot_end,
      (
        s.capacity
        - coalesce((
            select count(*) from appointments a
            where a.clinic_id = s.clinic_id
              and a.scheduled_at = (p_date + s.start_time)::timestamptz
              and a.status in ('pendente', 'confirmada', 'copiada')
              and not (
                a.status = 'pendente'
                and a.expires_at is not null
                and a.expires_at <= now()
              )
          ), 0)
        - coalesce((
            select count(*) from slot_locks l
            where l.clinic_id = s.clinic_id
              and l.slot_start = (p_date + s.start_time)::timestamptz
              and l.expires_at > now()
          ), 0)
      )::integer as remaining
    from availability_slots s
    where s.clinic_id = p_clinic_id
      and s.active
      and s.weekday = extract(dow from p_date)::int
      and not exists (
        select 1 from blocked_days b
        where b.clinic_id = s.clinic_id and b.day = p_date
      )
  ) t
  where t.remaining > 0
  order by t.slot_start;
$$;

revoke execute on function available_slots(uuid, date) from anon, authenticated;
