-- Telling somebody it is time to come back.
--
-- A clinic asked for this in the plainest terms: it wants to follow its
-- patients, not only answer them. Six months after a hygiene appointment,
-- three months after an operation, somebody should hear from the clinic. Today
-- nothing in this system can say that, because the only message it ever sends
-- is the answer to a booking the patient asked for out loud.
--
-- ── WHY IT CANNOT BE DONE BY READING THE APPOINTMENTS LATER ─────────────────
-- The obvious build is a nightly query: find every appointment six months old
-- for a service with a six month interval, and write to those people. It cannot
-- work here, and the reason is one migration old. 0045 clears
-- `appointments.reason` at ninety days, on every appointment, deliberately,
-- because it is the closest thing to health data this schema holds. At six
-- months there is nothing left saying what the person came for.
--
-- So the reminder is written when the appointment is accepted, carrying its own
-- copy of what it is for and the date it comes due. The reason still dies at
-- ninety days. The reminder outlives it in a row that exists for one purpose
-- and is thrown away when that purpose is spent, which is the whole of purpose
-- limitation in two sentences.
--
-- ── AND WHY THE MESSAGE NEVER NAMES THE TREATMENT ──────────────────────────
-- An SMS arrives on a lock screen, and the person holding the telephone is not
-- always the person it is about. "Recuerde su revisión de implantes" tells
-- whoever is looking what was done to somebody. The row knows the service,
-- because the clinic needs to know why it is writing; the message says that it
-- is time for an appointment, the clinic's name, and a number to ring.
--
-- ── TWO PERMISSIONS, NOT ONE ───────────────────────────────────────────────
-- A reminder about care somebody has already had and an offer on whitening are
-- not the same thing in law. The first sits inside the relationship the patient
-- started, with a right to stop it. The second is a commercial communication
-- and needs consent given first: Spain's LSSI article 21, Portugal's DL 7/2004
-- article 22. One flag would have let us send the second under the first's
-- justification, so there are two, and the commercial one is null until
-- somebody actually said yes and the row says where they said it.
--
-- ── OFF UNTIL A CLINIC TURNS IT ON ─────────────────────────────────────────
-- `recalls_enabled` defaults to false and that is the most important default in
-- this file. Every clinic on this platform has patients in it. A migration that
-- shipped this switched on would write to all of them, tonight, without anybody
-- having asked for a single one of those messages.
--
-- It also fixes something 0046 left open, at the end: `erase_patient` is from
-- 0040 and has never heard of the `patients` table.

-- ── WHAT THE CLINIC KNOWS ABOUT THE PERSON ──────────────────────────────────
-- 0046 said, in as many words, no notes and no clinical anything. This adds a
-- note, and the reasoning has to be stated rather than quietly reversed: a
-- record with a name and a telephone number is a contacts list, and a clinic
-- following a patient over years needs somewhere to write "prefers mornings",
-- "comes with her daughter", "quoted for the second implant in March".
--
-- What has not changed is where clinical history belongs, which is the clinic's
-- own software. The field is labelled for that in the panel and it is the one
-- thing on the record Telma is never given: the prompt gets `known_patient` and
-- nothing else, so a note cannot be read out loud to whoever rings from that
-- number.
alter table patients add column if not exists notes text;

-- Off, by the patient's own decision. A reminder about their care is something
-- they can stop at any time and the record of stopping it has to be the thing
-- the sender checks, not a line in an inbox somewhere.
alter table patients add column if not exists reminders_opt_out_at timestamptz;

-- On, by the patient's own decision, for anything commercial. Null is the
-- answer for everybody who has never been asked, which is everybody, and null
-- means nothing commercial is ever sent.
alter table patients add column if not exists marketing_consent_at timestamptz;
-- Where the yes came from: "no balcão 12/03", "formulário do site", "ao
-- telefone com a Telma". Free text, because the proof is the clinic's to keep
-- and a dropdown would invent categories nobody's paperwork uses.
alter table patients add column if not exists marketing_consent_source text;

comment on column patients.marketing_consent_at is
  'When the patient consented to commercial messages. Null means never asked, '
  'which is the same as no: nothing commercial is sent without a date here.';

-- ── WHICH OF THE CLINIC'S OWN TREATMENTS IT WAS ────────────────────────────
-- The service was never stored. It is derived at render time by matching
-- `reason` against what the clinic offers, in TypeScript, which works while the
-- reason is there and stops working at ninety days.
--
-- Stored now, from the same match the webhook already runs to work out how long
-- to leave in the diary. It is the clinic's own service id, not the patient's
-- words: "dental_higiene", never "me duele la muela de arriba". And it is
-- cleared by the same purge that clears the reason, at the same ninety days,
-- because after that it is the same information about the same person.
alter table appointments add column if not exists service_id text;

comment on column appointments.service_id is
  'The clinic''s own service, matched from what the caller said. Cleared at 90 '
  'days with the reason; a recall keeps its own copy of it.';

-- ── WHAT THE CLINIC CONFIGURES ──────────────────────────────────────────────
alter table clinics add column if not exists recalls_enabled boolean not null default false;

-- Months, against the same keys as `service_durations` and `service_prices`: a
-- catalogue id, or the exact line the clinic typed under other services. A
-- service with no entry gets no reminder, which is the right default for the
-- ones where a reminder makes no sense.
alter table clinics add column if not exists recall_months jsonb not null default '{}'::jsonb;

comment on column clinics.recall_months is
  '{ "<service id or custom service name>": <months> }. When an appointment for '
  'that service is accepted, a reminder is scheduled that many months out.';

-- ── THE REMINDER ────────────────────────────────────────────────────────────
do $$ begin
  create type recall_kind as enum ('aviso', 'campanha');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recall_state as enum ('agendado', 'enviado', 'cancelado', 'falhou');
exception when duplicate_object then null; end $$;

create table if not exists patient_recalls (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  -- 'aviso' is about their own care and needs no consent, only the absence of
  -- an opt-out. 'campanha' is commercial and sends nothing without one.
  kind        recall_kind not null default 'aviso',
  due_on      date not null,
  -- For the clinic's eyes and the clinic's list. Never in the message.
  service_id  text,
  -- Why this reminder exists, in the clinic's own words, when somebody set it
  -- by hand: "revisão 3 meses após a cirurgia". Also never in the message.
  note        text,
  -- The sentence to send, for a campanha only. An aviso uses the fixed copy in
  -- lib/recall-copy.ts, which is versioned with the application and tested; a
  -- clinic writing its own reminder each time is a clinic writing the wrong one
  -- once.
  body        text,
  state       recall_state not null default 'agendado',
  -- Whether a trigger made it or a person did. A clinic turning the automatic
  -- reminders off should not lose the one it set by hand for an operation.
  source      text not null default 'automatico'
              check (source in ('automatico', 'manual')),
  appointment_id uuid references appointments(id) on delete set null,
  sent_at     timestamptz,
  channel     text,
  error       text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_recalls_due
  on patient_recalls (due_on) where state = 'agendado';
create index if not exists idx_recalls_clinic
  on patient_recalls (clinic_id, due_on);
create index if not exists idx_recalls_patient
  on patient_recalls (patient_id, due_on desc);

-- One waiting care reminder per person per service. Somebody who comes twice
-- for the same thing does not get told twice; the second visit moves the one
-- that is waiting, which is what `schedule_recall` below does.
create unique index if not exists idx_recalls_one_pending
  on patient_recalls (clinic_id, patient_id, coalesce(service_id, ''))
  where state = 'agendado' and kind = 'aviso' and source = 'automatico';

alter table patient_recalls enable row level security;

-- The same door as `patients` in 0046 and `appointments` in 0002. A reminder
-- says a named person is due a named treatment, so it is at least as sensitive
-- as either, and gets no wider a policy than they do.
drop policy if exists recalls_select on patient_recalls;
create policy recalls_select on patient_recalls for select
  using (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists recalls_update on patient_recalls;
create policy recalls_update on patient_recalls for update
  using (public.is_internal() or clinic_id = public.current_clinic_id())
  with check (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists recalls_insert on patient_recalls;
create policy recalls_insert on patient_recalls for insert
  with check (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists recalls_delete on patient_recalls;
create policy recalls_delete on patient_recalls for delete
  using (public.is_internal() or clinic_id = public.current_clinic_id());

-- ── WHEN IT GOES OUT ────────────────────────────────────────────────────────
-- Never on a Saturday or a Sunday. Every one of these messages ends by asking
-- the patient to ring the clinic, and a clinic that is shut cannot be rung: the
-- message arrives, the person means to call, and by Monday it is buried under
-- everything else that arrived over the weekend.
create or replace function next_working_day(d date) returns date
language sql immutable as $$
  select case extract(isodow from d)
           when 6 then d + 2
           when 7 then d + 1
           else d
         end
$$;

/**
 * Put a reminder in the diary, or move the one that is already there.
 *
 * Both sources come through here: the trigger below when an appointment is
 * accepted, and the panel when somebody sets one by hand.
 *
 * The moving is the part worth reading. A patient who comes back for the same
 * treatment before the reminder fires must not be sent it anyway — they are
 * sitting in the chair. So the waiting reminder is pushed out to the new date
 * rather than a second one being written, and `greatest` means a visit can only
 * ever push it later, never pull it forward.
 */
create or replace function schedule_recall(
  p_clinic_id      uuid,
  p_patient_id     uuid,
  p_due_on         date,
  p_kind           recall_kind default 'aviso',
  p_service_id     text default null,
  p_note           text default null,
  p_body           text default null,
  p_source         text default 'manual',
  p_actor          uuid default null,
  p_appointment_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id  uuid;
  v_due date;
begin
  if p_clinic_id is null or p_patient_id is null or p_due_on is null then
    return null;
  end if;

  -- A reminder dated yesterday would go out tonight. Whoever asked for one in
  -- the past meant today.
  v_due := next_working_day(greatest(p_due_on, current_date));

  -- The person has to belong to the clinic asking. The panel passes an id from
  -- a list it read under RLS, and this function is security definer, so this is
  -- the line that stops one clinic writing a reminder into another's list.
  if not exists (
    select 1 from patients
     where id = p_patient_id and clinic_id = p_clinic_id
  ) then
    return null;
  end if;

  if p_source = 'automatico' and p_kind = 'aviso' then
    update patient_recalls
       set due_on = greatest(due_on, v_due),
           appointment_id = coalesce(p_appointment_id, appointment_id),
           service_id = coalesce(p_service_id, service_id)
     where clinic_id = p_clinic_id
       and patient_id = p_patient_id
       and coalesce(service_id, '') = coalesce(p_service_id, '')
       and kind = 'aviso'
       and source = 'automatico'
       and state = 'agendado'
    returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into patient_recalls (
    clinic_id, patient_id, kind, due_on, service_id, note, body, source,
    appointment_id, created_by
  ) values (
    p_clinic_id, p_patient_id, p_kind, v_due, p_service_id, p_note, p_body,
    p_source, p_appointment_id, p_actor
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Revoked from `authenticated` as well as `anon`, which matters more than it
-- looks. The function is security definer, so it runs past every policy: a
-- logged-in clinic calling it directly with somebody else's clinic id would
-- write a reminder into their list. The panel reaches it through a server action
-- that has already established which clinic is asking.
revoke execute on function schedule_recall(uuid, uuid, date, recall_kind, text, text, text, text, uuid, uuid) from anon, authenticated;

/**
 * The automatic half: an accepted appointment schedules the next one.
 *
 * Fires on the clinic accepting a booking, not on Telma taking it. A
 * pre-marcação the clinic then refuses is not a visit, and scheduling from it
 * would write to somebody who was never seen.
 *
 * And it unschedules. A booking that is cancelled, refused or left to expire
 * takes its reminder with it, which is the case a nightly query over old
 * appointments would have got wrong in the other direction.
 */
create or replace function recall_after_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_months  integer;
  v_clinic  record;
begin
  if new.patient_id is null then return new; end if;

  -- A booking that stopped being one. Only the automatic reminder goes: one set
  -- by hand for an operation is somebody's decision about a person, not about
  -- this row.
  if new.status in ('cancelada', 'rejeitada', 'expirada') then
    delete from patient_recalls
     where appointment_id = new.id
       and source = 'automatico'
       and state = 'agendado';
    return new;
  end if;

  if new.status not in ('confirmada', 'copiada') then return new; end if;
  -- Confirming and then copying to the clinic's software is one acceptance
  -- pressed twice. Without this the second one runs the whole body again.
  if tg_op = 'UPDATE' and old.status in ('confirmada', 'copiada') then
    return new;
  end if;

  select recalls_enabled, recall_months, timezone into v_clinic
    from clinics where id = new.clinic_id;
  if not found or not v_clinic.recalls_enabled then return new; end if;

  -- No service, no interval, no reminder. A clinic that has set no months
  -- against anything has the feature on and nothing scheduled, which is exactly
  -- what it asked for.
  if coalesce(new.service_id, '') = '' then return new; end if;
  begin
    v_months := (v_clinic.recall_months ->> new.service_id)::integer;
  exception when others then
    v_months := null;
  end;
  if v_months is null or v_months <= 0 then return new; end if;

  -- Counted from the day of the appointment as the clinic's calendar reads it.
  -- `scheduled_at` is UTC, and a half past midnight appointment in Lisbon
  -- counted in UTC is a day out before the six months are even added.
  perform schedule_recall(
    new.clinic_id,
    new.patient_id,
    ((new.scheduled_at at time zone coalesce(v_clinic.timezone, 'Europe/Lisbon'))::date
      + (v_months || ' months')::interval)::date,
    'aviso',
    new.service_id,
    null,
    null,
    'automatico',
    null,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_recall_after_appointment on appointments;
create trigger trg_recall_after_appointment
  after insert or update of status on appointments
  for each row execute function recall_after_appointment();

-- ── THROWING THEM AWAY ──────────────────────────────────────────────────────
/**
 * What a reminder leaves behind, and for how long.
 *
 * Sent and failed ones for twelve months, the same as the activity log: a
 * clinic looking at a record should be able to see it wrote to this person in
 * March, and a year is the horizon everything else in this schema uses for
 * "what happened".
 *
 * Waiting ones that are two months overdue are deleted rather than sent. If the
 * job has not run for sixty days the reminder is wrong, and a clinic that
 * switched the feature off for a month should not have its backlog delivered
 * the day it switches back on.
 *
 * And the records themselves. 0046 gave `patients` a `last_seen_at` and said it
 * was there to decide whether a record was still worth keeping, and then
 * nothing ever read it. Three years: long enough that a two year recall cycle
 * is untouched, short enough that a list of people who stopped being patients
 * before the pandemic is not still sitting here.
 */
create or replace function purge_recalls() returns jsonb language plpgsql as $$
declare
  v_old      integer;
  v_stale    integer;
  v_patients integer;
  v_services integer;
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

  -- ── AND THE SERVICE, WITH THE REASON ──────────────────────────────────────
  -- `appointments.service_id` is the same information as `reason` for the same
  -- person, so it goes at the same ninety days. It is cleared here and not in
  -- 0045's purge_appointments() for the reason 0045 itself gives about 0039:
  -- adding two statements to that function would mean copying its whole body
  -- into this file, and then 0045 is the file somebody edits while this one
  -- silently wins.
  update appointments set service_id = null
   where service_id is not null
     and scheduled_at < now() - interval '90 days';
  get diagnostics v_services = row_count;

  return jsonb_build_object(
    'recalls_expired', v_old,
    'recalls_stale', v_stale,
    'patients_forgotten', v_patients,
    'service_ids_cleared', v_services
  );
end;
$$;

revoke execute on function purge_recalls() from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('telma-purge') where exists (
      select 1 from cron.job where jobname = 'telma-purge'
    );
    perform cron.schedule(
      'telma-purge',
      '30 3 * * *',
      'select purge_expired() || purge_appointments() || purge_recalls()'
    );
  else
    raise notice 'pg_cron nao disponivel: purge_recalls() existe mas ninguem a corre.';
  end if;
end $$;

-- ── THE HOLE 0046 LEFT ──────────────────────────────────────────────────────
-- `erase_patient` is from 0040 and the `patients` table is from 0046, so the one
-- function that exists to remove a person from a clinic has never heard of the
-- place their name now lives. An erasure today empties the appointments and the
-- calls and leaves the record whole, with the name and the telephone number in
-- it, which is the opposite of what the function is for.
--
-- Redefined here in full rather than patched, because a function is redefined in
-- full or not at all. Everything except the patients block is 0040's body word
-- for word.
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
         summary = null,
         service_id = null
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

  -- ── THE RECORD ITSELF ──────────────────────────────────────────────────────
  -- Deleted, not emptied, and the difference from the appointments above is the
  -- point. An appointment is also the clinic's record of an hour it worked and
  -- billed, so the hour stays and the person goes. A patient record is the
  -- clinic's record of nothing: it exists so a returning caller is recognised
  -- and so the clinic can write to them. Somebody asking to be forgotten is
  -- asking for exactly that to stop.
  --
  -- Every waiting reminder goes with it, by cascade. Counted first, so the
  -- receipt can say how many messages will now never be sent.
  select count(*) into v_recs
    from patient_recalls r
    join patients p on p.id = r.patient_id
   where r.clinic_id = p_clinic_id
     and p.phone_digits = v_digits;

  delete from patients p
   where p.clinic_id = p_clinic_id
     and p.phone_digits = v_digits;

  -- The activity feed writes names into sentences ("A Telma deixou uma
  -- pre-marcacao para Ana Torres"), and there is no key joining those lines to
  -- anything. Matching on the name is crude and it is the only way to reach
  -- them; the alternative is leaving the name behind in the one place nobody
  -- would think to look.
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
  'One reminder waiting to be sent, or the record that one was. Created when an '
  'appointment is accepted or by hand from the patient record; never names the '
  'treatment in the message it sends.';
