-- Putting the two slot functions back to what this repository says they are.
--
-- `available_slots` and `hold_slot` were both failing in the live database with
-- `column "duration_minutes" does not exist`. That column exists nowhere in this
-- folder, in `lib/`, or in `app/`: the definitions running in Postgres were not
-- the ones here. Same story as the catalogue tables in 0022, from the same
-- parallel work, and found the same way: the first real call to
-- /api/availability answered 500.
--
-- Nothing else was touched. `record_call` was checked at the same time and is
-- the repository's version, so it is deliberately left alone: replacing a
-- function that is already correct is a chance to get it wrong.
--
-- The bodies below are copied verbatim from the migrations that own them, which
-- are 0020 for `available_slots` (it added the rule about a pre-marcação past
-- its deadline releasing its hour) and 0003 for `hold_slot`. If either is ever
-- changed again, change it there and re-run this.

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

create or replace function hold_slot(p_clinic_id uuid, p_slot_start timestamptz, p_call_ref text)
returns slot_locks language plpgsql as $$
declare
  v_rem integer;
  v_row slot_locks;
begin
  delete from slot_locks where expires_at <= now();

  select remaining into v_rem
  from available_slots(p_clinic_id, p_slot_start::date)
  where slot_start = p_slot_start;

  if v_rem is null then
    raise exception 'slot_not_available' using errcode = 'P0001';
  end if;

  insert into slot_locks (clinic_id, slot_start, call_ref)
  values (p_clinic_id, p_slot_start, p_call_ref)
  returning * into v_row;

  return v_row;
exception when unique_violation then
  raise exception 'slot_locked' using errcode = 'P0001';
end $$;

create or replace function release_slot(p_clinic_id uuid, p_slot_start timestamptz)
returns void language sql as $$
  delete from slot_locks where clinic_id = p_clinic_id and slot_start = p_slot_start;
$$;
