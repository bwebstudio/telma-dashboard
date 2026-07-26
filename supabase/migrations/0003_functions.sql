-- Functions used by the internal API (voice webhooks).
-- These are called server side with the service role key, so they are not
-- exposed to anon or authenticated clients.

-- Free concrete times offered for a clinic on a given date.
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

-- Hold a concrete time for the duration of a call (3 minutes).
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

create or replace function release_slot_by_ref(p_call_ref text)
returns void language sql as $$
  delete from slot_locks where call_ref = p_call_ref;
$$;

-- Record a finished call in one atomic step:
-- inserts the call, optionally the pre-marcacao, bumps monthly usage,
-- releases the lock and logs activity (including an 80% limit warning).
create or replace function record_call(
  p_clinic_id     uuid,
  p_from_phone    text,
  p_duration      integer,
  p_result        call_result,
  p_summary       text,
  p_recording_url text,
  p_external_ref  text,
  p_appointment   jsonb
) returns jsonb language plpgsql as $$
declare
  v_call_id uuid;
  v_appt_id uuid;
  v_month   date := date_trunc('month', now())::date;
  v_slot    timestamptz;
  v_count   integer;
  v_limit   integer;
begin
  insert into calls (clinic_id, from_phone, duration_seconds, result, summary, recording_url, external_ref)
  values (p_clinic_id, p_from_phone, coalesce(p_duration, 0), p_result, p_summary, p_recording_url, p_external_ref)
  returning id into v_call_id;

  if p_appointment is not null and p_appointment <> 'null'::jsonb then
    v_slot := (p_appointment->>'scheduled_at')::timestamptz;
    insert into appointments (clinic_id, call_id, patient_name, patient_phone, reason, scheduled_at, origin, summary)
    values (
      p_clinic_id, v_call_id,
      p_appointment->>'patient_name',
      p_appointment->>'patient_phone',
      p_appointment->>'reason',
      v_slot,
      coalesce((p_appointment->>'origin')::appointment_origin, 'telefone'),
      p_summary
    ) returning id into v_appt_id;

    delete from slot_locks where clinic_id = p_clinic_id and slot_start = v_slot;

    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'appointment_created',
      'A Telma deixou uma pre-marcacao para ' || coalesce(p_appointment->>'patient_name', 'um paciente'));
  end if;

  insert into usage (clinic_id, month, calls_count, minutes)
  values (p_clinic_id, v_month, 1, round(coalesce(p_duration, 0) / 60.0, 2))
  on conflict (clinic_id, month) do update
    set calls_count = usage.calls_count + 1,
        minutes = usage.minutes + round(coalesce(p_duration, 0) / 60.0, 2);

  insert into activity_log (clinic_id, type, message)
  values (p_clinic_id, 'call_received', 'A Telma atendeu uma chamada');

  select calls_count into v_count from usage where clinic_id = p_clinic_id and month = v_month;
  select call_limit into v_limit from clinics where id = p_clinic_id;
  if v_limit > 0 and v_count >= (v_limit * 0.8) then
    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'limit_warning',
      'A clinica passou 80% do limite de chamadas (' || v_count || '/' || v_limit || ')');
  end if;

  return jsonb_build_object('call_id', v_call_id, 'appointment_id', v_appt_id);
end $$;

-- Only the service role may call these.
revoke execute on function available_slots(uuid, date) from anon, authenticated;
revoke execute on function hold_slot(uuid, timestamptz, text) from anon, authenticated;
revoke execute on function release_slot(uuid, timestamptz) from anon, authenticated;
revoke execute on function release_slot_by_ref(text) from anon, authenticated;
revoke execute on function record_call(uuid, text, integer, call_result, text, text, text, jsonb) from anon, authenticated;
