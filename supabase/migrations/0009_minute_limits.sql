-- Plans are sold in minutes of conversation, not in calls.
--
-- A call asking about opening hours lasts twenty seconds and a booking with a
-- reschedule lasts six minutes. Counting them as the same unit meant the limit
-- the panel enforced was not the limit the landing page sold, and it priced the
-- cheap call and the expensive one identically. The meter is now the minute,
-- which is also how the voice provider bills us.
--
-- `usage` already recorded both columns, so no data is lost: `calls_count`
-- stays as the human readable figure ("about 300 calls"), and `minutes` becomes
-- the number the limit is measured against.

alter table clinics rename column call_limit to minute_limit;

-- The old values were call allowances (250 / 600 / 1500). Rewrite them as the
-- minute allowance of the plan each clinic is actually on, rather than trying
-- to convert a number that never meant minutes. Bespoke plans keep whatever
-- they had if it is already above the Rede allowance, so a negotiated limit is
-- never silently reduced.
update clinics set minute_limit = case plan
  when 'essencial' then 250
  when 'clinica'   then 750
  when 'rede'      then 2000
  else greatest(minute_limit, 2000)
end;

alter table clinics alter column minute_limit set default 250;

-- record_call: same atomic insert as before, but the 80% warning now watches
-- the minutes consumed this month instead of the call count.
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
  v_call_id  uuid;
  v_appt_id  uuid;
  v_month    date := date_trunc('month', now())::date;
  v_slot     timestamptz;
  v_minutes  numeric;
  v_limit    integer;
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

  select minutes into v_minutes from usage where clinic_id = p_clinic_id and month = v_month;
  select minute_limit into v_limit from clinics where id = p_clinic_id;
  if v_limit > 0 and v_minutes >= (v_limit * 0.8) then
    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'limit_warning',
      'A clinica passou 80% do limite de minutos (' || round(v_minutes) || '/' || v_limit || ')');
  end if;

  return jsonb_build_object('call_id', v_call_id, 'appointment_id', v_appt_id);
end $$;

revoke execute on function record_call(uuid, text, integer, call_result, text, text, text, jsonb) from anon, authenticated;
