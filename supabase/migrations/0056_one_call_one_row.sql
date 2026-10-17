-- One conversation is one row, one charge, however many times we hear about it.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
-- ElevenLabs can call the webhook twice for the same conversation: a retry, a
-- dropped response, or the agent registering at the end of each booking rather
-- than once at the end of the call. The route handled that by looking for an
-- existing row with the same `external_ref` and updating it instead.
--
-- Two holes in that.
--
-- The first is the look. Two deliveries arriving together both find nothing,
-- both insert, and the conversation is billed twice: it happened once already,
-- 82 seconds plus 164 for a call that lasted 164. The check and the insert are
-- two statements with a gap between them, and nothing in the schema closed it.
--
-- The second is the update. It wrote the corrected duration onto the call and
-- left `usage` untouched, so the minutes stayed at whatever the first, shorter
-- attempt had guessed. That is a charge that is too small, which is the kind of
-- bug nobody reports and everybody pays for in the end.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
-- The index makes the row unique, so the race cannot be won twice. `record_call`
-- becomes an upsert over it, and `usage` moves by the difference between what
-- this conversation was charged before and what it costs now. Run the same
-- event ten times and the clinic is charged once, for the duration of the last
-- word anybody heard.
--
-- The appointment is written only when the call row is new. The route does its
-- own deduplication for the bookings of a repeated delivery, and two writers of
-- the same booking is the other way to show a clinic three appointments where a
-- patient made two.

-- ── THE INDEX ──────────────────────────────────────────────────────────────
-- Partial, because a call with no reference is not a duplicate of the next one
-- with no reference: six of the rows in this database are seeded demonstration
-- calls that never had one, and a plain unique index would have refused them.
-- Checked before writing this: no clinic has two calls under one reference.
create unique index if not exists idx_calls_clinic_external_ref
  on calls (clinic_id, external_ref)
  where external_ref is not null;

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
  v_call_id   uuid;
  v_appt_id   uuid;
  v_month     date := date_trunc('month', now())::date;
  v_slot      timestamptz;
  v_minutes   numeric;
  v_limit     integer;
  v_was_new   boolean := true;
  v_before    integer := 0;
  v_now       integer := coalesce(p_duration, 0);
  v_delta_min numeric;
begin
  -- ── THE CALL ─────────────────────────────────────────────────────────────
  -- With a reference, the row is claimed by whoever gets there first and the
  -- second delivery updates it. Without one there is nothing to deduplicate on,
  -- which is the old behaviour and right for a call that carries no id.
  if p_external_ref is not null then
    select id, duration_seconds into v_call_id, v_before
      from calls
     where clinic_id = p_clinic_id and external_ref = p_external_ref;

    insert into calls (clinic_id, from_phone, duration_seconds, result, summary, recording_url, external_ref)
    values (p_clinic_id, p_from_phone, v_now, p_result, p_summary, p_recording_url, p_external_ref)
    on conflict (clinic_id, external_ref) where external_ref is not null
    do update set
      -- The later delivery knows more: it has the whole conversation behind it.
      duration_seconds = excluded.duration_seconds,
      result           = coalesce(excluded.result, calls.result),
      summary          = coalesce(excluded.summary, calls.summary),
      recording_url    = coalesce(excluded.recording_url, calls.recording_url)
    returning id, (xmax = 0) into v_call_id, v_was_new;

    if not v_was_new then
      -- v_before was read before the upsert; if the row appeared between the
      -- two statements, the read found nothing and zero is the honest answer.
      v_before := coalesce(v_before, 0);
    else
      v_before := 0;
    end if;
  else
    insert into calls (clinic_id, from_phone, duration_seconds, result, summary, recording_url, external_ref)
    values (p_clinic_id, p_from_phone, v_now, p_result, p_summary, p_recording_url, null)
    returning id into v_call_id;
  end if;

  -- ── THE BOOKING ──────────────────────────────────────────────────────────
  -- Only for a call we had not seen. A repeated delivery's bookings are the
  -- route's business: it knows which of them are already written.
  if v_was_new and p_appointment is not null and p_appointment <> 'null'::jsonb then
    v_slot := (p_appointment->>'scheduled_at')::timestamptz;
    insert into appointments (clinic_id, call_id, patient_name, patient_phone, reason, scheduled_at, origin, summary, duration_minutes, resource_id)
    values (
      p_clinic_id, v_call_id,
      p_appointment->>'patient_name',
      p_appointment->>'patient_phone',
      p_appointment->>'reason',
      v_slot,
      coalesce((p_appointment->>'origin')::appointment_origin, 'telefone'),
      coalesce(nullif(p_appointment->>'note', ''), p_summary),
      nullif(p_appointment->>'duration_minutes', '')::smallint,
      nullif(p_appointment->>'resource_id', '')::uuid
    ) returning id into v_appt_id;

    delete from slot_locks where clinic_id = p_clinic_id and slot_start = v_slot;

    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'appointment_created',
      'A Telma deixou uma pre-marcacao para ' || coalesce(p_appointment->>'patient_name', 'um paciente'));
  end if;

  -- ── WHAT IT COST ─────────────────────────────────────────────────────────
  -- The difference, not the total. A first delivery moves usage by the whole
  -- duration because it was charged nothing before; a correction moves it by
  -- what changed, in either direction; an identical repeat moves it by zero,
  -- which is what makes running this twice the same as running it once.
  v_delta_min := round(v_now / 60.0, 2) - round(v_before / 60.0, 2);

  insert into usage (clinic_id, month, calls_count, minutes)
  values (p_clinic_id, v_month, case when v_was_new then 1 else 0 end, greatest(v_delta_min, 0))
  on conflict (clinic_id, month) do update
    set calls_count = usage.calls_count + case when v_was_new then 1 else 0 end,
        -- Never below nothing: a correction downwards on the first call of a
        -- month must not leave the month owing the clinic minutes.
        minutes = greatest(usage.minutes + v_delta_min, 0);

  if v_was_new then
    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'call_received', 'A Telma atendeu uma chamada');
  end if;

  select minutes into v_minutes from usage where clinic_id = p_clinic_id and month = v_month;
  select minute_limit into v_limit from clinics where id = p_clinic_id;
  if v_was_new and v_limit > 0 and v_minutes >= (v_limit * 0.8) then
    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'limit_warning',
      'A clinica passou 80% do limite de minutos (' || round(v_minutes) || '/' || v_limit || ')');
  end if;

  return jsonb_build_object('call_id', v_call_id, 'appointment_id', v_appt_id, 'was_new', v_was_new);
end $$;
