-- How long a booking is held, and who hears about it when it lapses.
--
-- ── THE THIRTY MINUTES NOBODY CHOSE ────────────────────────────────────────
-- 0020 holds a pre-marcação for thirty minutes and then lets the hour go.
-- Thirty was written into the trigger. A clinic with somebody at the desk all
-- morning wants longer; one that answers in the evening wants the hour back
-- sooner. It is the clinic's business and it is now the clinic's setting.
--
-- ── AND THE PATIENT WAS NEVER TOLD ─────────────────────────────────────────
-- The sweep moved the booking to 'expirada' and that was the end of it. The
-- hour went back on sale, and the one person who still believed they had an
-- appointment was the one who asked for it. They would have turned up.
--
-- Telling them needs an SMS, and SQL cannot send one, so the sweep now returns
-- which bookings it moved instead of only how many. The caller sends the
-- message. Returning rows rather than a count is the whole change here: the
-- status write stays the gate, so whoever sweeps first is the one that tells
-- the patient, exactly once.

alter table public.clinics
  add column if not exists pre_appointment_hold_minutes integer not null default 30
  check (pre_appointment_hold_minutes between 5 and 1440);

comment on column public.clinics.pre_appointment_hold_minutes is
  'How long an unconfirmed booking holds its hour, in minutes. Only read when pre_appointment_auto_expires is true.';

-- The trigger reads it instead of knowing it.
create or replace function set_preappointment_expiry()
returns trigger language plpgsql as $$
declare
  v_auto boolean;
  v_minutes integer;
begin
  if new.status = 'pendente' then
    if new.expires_at is null and tg_op = 'INSERT' then
      select pre_appointment_auto_expires, pre_appointment_hold_minutes
        into v_auto, v_minutes
        from clinics where id = new.clinic_id;

      if coalesce(v_auto, true) then
        new.expires_at := now() + make_interval(mins => coalesce(v_minutes, 30));
      end if;
    end if;
  else
    new.expires_at := null;
  end if;
  return new;
end $$;

-- The sweep says which ones, so somebody can tell the patient.
drop function if exists expire_stale_preappointments(uuid);
create or replace function expire_stale_preappointments(p_clinic_id uuid default null)
returns table (id uuid) language plpgsql as $$
begin
  return query
  update appointments
     set status = 'expirada'
   where status = 'pendente'
     and expires_at is not null
     and expires_at <= now()
     and (p_clinic_id is null or clinic_id = p_clinic_id)
  returning appointments.id;
end $$;
