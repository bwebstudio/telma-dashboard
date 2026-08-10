-- A note per appointment, instead of the whole call's summary on the first one.
--
-- `record_call` wrote `p_summary` into the appointment it created, and the
-- appointments after the first got nothing at all. On a real call somebody
-- booked a first consultation and a laser session in one conversation, and the
-- panel showed one card carrying a summary about both bookings and a second
-- card carrying none. The clinic reads these one at a time, on the day: a note
-- that describes a different appointment is worse than no note, and a card with
-- no note loses whatever the patient asked for.
--
-- The reasons were already right on both. What was missing was anywhere to put
-- "she asked to be rung about the price of this one".
--
-- `note` falls back to the call summary, so a single-appointment call behaves
-- exactly as it did and nothing already written changes.
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
      coalesce(nullif(p_appointment->>'note', ''), p_summary)
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
