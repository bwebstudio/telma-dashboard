-- Taking the automatic reminders out again, one day after putting them in.
--
-- 0047 scheduled a reminder from a table of intervals: hygiene every six
-- months, orthodontics every three. Two things were wrong with it and the
-- second one is the reason this file is a removal and not an adjustment.
--
-- ── THE MESSAGE CANNOT TELL THEM APART ──────────────────────────────────────
-- Every reminder this system sends is the same sentence, deliberately: "it is
-- time to book". It never names the treatment, because an SMS is read on a lock
-- screen by whoever is holding the telephone. So a patient on two cycles got
-- that sentence twice, word for word, with nothing in either one to say why.
-- The setting's only visible effect was duplicates.
--
-- ── AND EVERY CASE IS DIFFERENT ─────────────────────────────────────────────
-- Which is the clinic's own objection to the whole idea, and it is right. "Six
-- months after a hygiene appointment" is true of the patient who comes every
-- six months and false of the one who was discharged, the one who moved away,
-- the one who came once for an emergency. A rule that cannot see any of that
-- sends the same message to all of them, months later, when nobody at the
-- clinic remembers setting it.
--
-- So a reminder is a decision somebody makes about somebody, on their record,
-- with the reason written next to it. What survives from 0047 is everything
-- that carries one: the queue, the consent, the copy that never names a
-- treatment, the fortnight of visibility before it goes, and the erasure fix.
-- What goes is the part that decided by itself.

drop trigger if exists trg_recall_after_appointment on appointments;
drop function if exists recall_after_appointment();

alter table clinics drop column if exists recall_months;
alter table clinics drop column if exists recalls_enabled;

-- ── AND THE SERVICE ON THE APPOINTMENT ──────────────────────────────────────
-- Added by 0047 for one reason: a reminder six months out had to know what the
-- appointment was for, and `reason` is cleared at ninety days. Nothing needs it
-- now, and it was the same information about the same person as the reason it
-- was copied from. A column holding health data that nothing reads is the
-- easiest kind to justify keeping and the least defensible kind to keep.
alter table appointments drop column if exists service_id;

-- ── ONE ORIGIN ──────────────────────────────────────────────────────────────
-- Every reminder is now somebody's decision, so there is no second kind to tell
-- it apart from, and the partial index that kept one automatic reminder per
-- patient has nothing left to count. `appointment_id` goes with it: it existed
-- so that cancelling a booking could cancel the reminder it had created, and
-- nothing creates one from a booking any more.
drop index if exists idx_recalls_one_pending;
alter table patient_recalls drop column if exists source;
alter table patient_recalls drop column if exists appointment_id;
alter table patient_recalls drop column if exists service_id;

/**
 * Put a reminder in the diary.
 *
 * All that is left of it. No moving an existing one, because there is no rule
 * writing one behind anybody's back for this to collide with: two reminders for
 * one person are now two things somebody typed, and if that is a mistake it is
 * a visible one on the record where both are listed.
 */
create or replace function schedule_recall(
  p_clinic_id  uuid,
  p_patient_id uuid,
  p_due_on     date,
  p_kind       recall_kind default 'aviso',
  p_note       text default null,
  p_body       text default null,
  p_actor      uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_clinic_id is null or p_patient_id is null or p_due_on is null then
    return null;
  end if;

  -- The person has to belong to the clinic asking. This function runs past
  -- every policy, so this is the line that stops one clinic writing a reminder
  -- into another's list.
  if not exists (
    select 1 from patients where id = p_patient_id and clinic_id = p_clinic_id
  ) then
    return null;
  end if;

  insert into patient_recalls (clinic_id, patient_id, kind, due_on, note, body, created_by)
  values (
    p_clinic_id,
    p_patient_id,
    p_kind,
    -- Never in the past, never on a day the clinic is shut: every one of these
    -- ends by asking the patient to ring, and a clinic that is closed cannot be
    -- rung.
    next_working_day(greatest(p_due_on, current_date)),
    p_note,
    p_body,
    p_actor
  ) returning id into v_id;

  return v_id;
end;
$$;

-- The old signature, left behind by `create or replace` because the arguments
-- changed. Dropped by hand so nothing can call the version that still expects a
-- service and a source.
drop function if exists schedule_recall(uuid, uuid, date, recall_kind, text, text, text, text, uuid, uuid);

revoke execute on function schedule_recall(uuid, uuid, date, recall_kind, text, text, uuid) from anon, authenticated;

/**
 * The purge, with the service clearing taken back out.
 *
 * It cleared `appointments.service_id` at ninety days, and there is no such
 * column now. Everything else is 0047's, unchanged.
 */
create or replace function purge_recalls() returns jsonb language plpgsql as $$
declare
  v_old      integer;
  v_stale    integer;
  v_patients integer;
begin
  delete from patient_recalls
   where state in ('enviado', 'falhou')
     and coalesce(sent_at, created_at) < now() - interval '12 months';
  get diagnostics v_old = row_count;

  delete from patient_recalls
   where state = 'agendado'
     and due_on < current_date - interval '60 days';
  get diagnostics v_stale = row_count;

  delete from patients p
   where p.last_seen_at < now() - interval '3 years'
     and not exists (
       select 1 from patient_recalls r
        where r.patient_id = p.id and r.state = 'agendado'
     );
  get diagnostics v_patients = row_count;

  return jsonb_build_object(
    'recalls_expired', v_old,
    'recalls_stale', v_stale,
    'patients_forgotten', v_patients
  );
end;
$$;

revoke execute on function purge_recalls() from anon, authenticated;

-- And the erasure, which 0047 taught to clear the service on the appointments
-- it anonymises. Same reason: there is no such column.
create or replace function erase_patient(
  p_clinic_id uuid,
  p_phone     text,
  p_reference text default null,
  p_actor     uuid default null
) returns jsonb language plpgsql as $$
declare
  v_digits text := right(phone_digits(p_phone), 9);
  v_names  text[];
  v_appts  integer := 0;
  v_calls  integer := 0;
  v_log    integer := 0;
  v_recs   integer := 0;
  v_id     uuid;
begin
  if v_digits = '' then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  select array_agg(distinct a.patient_name) into v_names
    from appointments a
   where a.clinic_id = p_clinic_id
     and right(phone_digits(a.patient_phone), 9) = v_digits;

  -- The booking survives, the person in it does not.
  update appointments a
     set patient_name = 'Apagado a pedido',
         patient_phone = '',
         summary = null
   where a.clinic_id = p_clinic_id
     and right(phone_digits(a.patient_phone), 9) = v_digits;
  get diagnostics v_appts = row_count;

  update calls c
     set from_phone = null,
         summary = null,
         recording_url = null
   where c.clinic_id = p_clinic_id
     and right(phone_digits(c.from_phone), 9) = v_digits;
  get diagnostics v_calls = row_count;

  -- The record itself goes, and every reminder waiting on it by cascade.
  -- Deleted and not emptied, unlike the appointments: an appointment is also
  -- the clinic's record of an hour it worked, and a patient record is the
  -- clinic's record of nothing.
  select count(*) into v_recs
    from patient_recalls r
    join patients p on p.id = r.patient_id
   where r.clinic_id = p_clinic_id
     and p.phone_digits = v_digits;

  delete from patients p
   where p.clinic_id = p_clinic_id
     and p.phone_digits = v_digits;

  -- The activity feed writes names into sentences and there is no key joining
  -- those lines to anything. Matching on the name is crude and it is the only
  -- way to reach them.
  if v_names is not null then
    delete from activity_log l
     where l.clinic_id = p_clinic_id
       and exists (
         select 1 from unnest(v_names) n
          where n is not null and n <> '' and l.message ilike '%' || n || '%'
       );
    get diagnostics v_log = row_count;
  end if;

  insert into erasures (clinic_id, reference, appointments_anonymised, calls_redacted, activity_deleted, performed_by)
  values (p_clinic_id, p_reference, v_appts, v_calls, v_log, p_actor)
  returning id into v_id;

  return jsonb_build_object(
    'erasure_id', v_id,
    'appointments_anonymised', v_appts,
    'calls_redacted', v_calls,
    'activity_deleted', v_log,
    'recalls_cancelled', v_recs
  );
end $$;

revoke execute on function erase_patient(uuid, text, text, uuid) from anon;

comment on table patient_recalls is
  'One reminder waiting to be sent, or the record that one was. Always somebody''s '
  'decision about somebody: nothing schedules these by itself. Never names the '
  'treatment in the message it sends.';
