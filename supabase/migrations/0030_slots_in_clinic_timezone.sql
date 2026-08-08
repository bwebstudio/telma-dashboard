-- The hours a clinic offers are its own hours.
--
-- `available_slots` built each slot with `(p_date + s.start_time)::timestamptz`.
-- That cast reads the naive timestamp in the **server's** timezone, which on
-- Supabase is UTC. So a clinic that opens at nine had its nine o'clock stored as
-- 09:00Z, and `lib/time.ts` — which formats in the clinic's own zone, as its own
-- header insists it must — drew it as eleven in Madrid and ten in Lisbon.
--
-- Nobody had seen it because nothing had asked for a slot yet: the seeded
-- appointments were written by hand at UTC times and looked plausible. The first
-- call that booked "nine o'clock" would have put the patient in the diary at
-- eleven, and the clinic would have found out when somebody arrived.
--
-- The fix is `at time zone c.timezone`, which reads the same naive timestamp as
-- local time in the clinic's zone. It needs the join to `clinics`, which is the
-- only change of shape: `clinics.timezone` has existed since 0012 and this
-- function never looked at it.
create or replace function available_slots(p_clinic_id uuid, p_date date)
returns table (slot_start timestamptz, slot_end time, remaining integer)
language sql stable as $$
  select t.slot_start, t.slot_end, t.remaining
  from (
    select
      ((p_date + s.start_time) at time zone c.timezone) as slot_start,
      s.end_time as slot_end,
      (
        s.capacity
        - coalesce((
            select count(*) from appointments a
            where a.clinic_id = s.clinic_id
              and a.scheduled_at = ((p_date + s.start_time) at time zone c.timezone)
              and a.status in ('pendente', 'confirmada', 'copiada')
              -- A pre-marcação past its deadline has let its hour go, whether or
              -- not anything has swept it yet. Same clause as 0020.
              and not (
                a.status = 'pendente'
                and a.expires_at is not null
                and a.expires_at <= now()
              )
          ), 0)
        - coalesce((
            select count(*) from slot_locks l
            where l.clinic_id = s.clinic_id
              and l.slot_start = ((p_date + s.start_time) at time zone c.timezone)
              and l.expires_at > now()
          ), 0)
      )::integer as remaining
    from availability_slots s
    join clinics c on c.id = s.clinic_id
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
