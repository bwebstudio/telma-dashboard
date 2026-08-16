-- Erasing one person, on request, without erasing the clinic's business.
--
-- The right exists whether or not a system can execute it, and the deadline is
-- a month. `purge_expired()` deletes by age and cannot help: somebody asking to
-- be forgotten today is asking about a booking from last week.
--
-- ── ANONYMISE, DO NOT DELETE ───────────────────────────────────────────────
-- An appointment is not only the patient's data. It is also the clinic's record
-- of a Tuesday afternoon it worked and billed. Deleting the row would answer
-- one person's request by taking something from somebody who did not ask, and
-- would leave a hole in a diary that has to add up. So the identifying parts go
-- and the rest stays: the clinic keeps a booking at that hour for that service,
-- with nobody's name on it.
--
-- ── WHAT IS NOT KEPT AS PROOF ──────────────────────────────────────────────
-- The record of the erasure holds no telephone number and no name. Storing a
-- hash of the number would be worse than useless: nine digits is a space small
-- enough to walk through in seconds, so a "fingerprint" would be the number
-- with extra steps, kept for ever, in a table created to prove we delete
-- things. What an audit needs is that an erasure happened, for one person, on a
-- date, at whose request. The clinic keeps the request itself.

create table if not exists erasures (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references clinics(id) on delete cascade,
  -- The clinic's own reference for the request, if it has one. Free text on
  -- purpose: their case number, or "email de 14/8", or nothing.
  reference              text,
  requested_at           timestamptz not null default now(),
  appointments_anonymised integer not null default 0,
  calls_redacted         integer not null default 0,
  activity_deleted       integer not null default 0,
  performed_by           uuid references users(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists idx_erasures_clinic on erasures(clinic_id, created_at desc);

alter table erasures enable row level security;

-- Only digits, so +34 623 456 789 and 623456789 are the same person. The same
-- normalisation the rest of the system uses when it compares numbers.
create or replace function phone_digits(raw text) returns text
language sql immutable as $$
  select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g')
$$;

/**
 * What is held about one person, before anything is touched.
 *
 * Shown to whoever is about to press the button. An erasure that cannot be
 * previewed is one nobody dares run.
 */
create or replace function find_patient_data(p_clinic_id uuid, p_phone text)
returns jsonb language sql stable as $$
  with digits as (select right(phone_digits(p_phone), 9) as d)
  select jsonb_build_object(
    'appointments', (
      select count(*) from appointments a, digits
       where a.clinic_id = p_clinic_id
         and right(phone_digits(a.patient_phone), 9) = digits.d
         and digits.d <> ''
    ),
    'names', (
      select coalesce(jsonb_agg(distinct a.patient_name), '[]'::jsonb)
        from appointments a, digits
       where a.clinic_id = p_clinic_id
         and right(phone_digits(a.patient_phone), 9) = digits.d
         and digits.d <> ''
    ),
    'calls', (
      select count(*) from calls c, digits
       where c.clinic_id = p_clinic_id
         and right(phone_digits(c.from_phone), 9) = digits.d
         and digits.d <> ''
    )
  )
$$;

/**
 * Erase one person from one clinic.
 *
 * Scoped to a clinic on purpose: a number that belongs to two clinics is two
 * relationships, and only one of them asked.
 */
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
    'activity_deleted', v_log
  );
end $$;

revoke execute on function erase_patient(uuid, text, text, uuid) from anon;
