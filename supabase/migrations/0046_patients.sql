-- The person, as an entity, instead of a name copied onto every booking.
--
-- There was no patient anywhere in this schema. Identity was reconstructed on
-- each call by asking which appointments carry this telephone number, which is
-- enough for the two things that needed it — cancelling a booking, and the
-- out-of-hours rule that only puts existing patients through — and enough for
-- nothing else.
--
-- What it costs: Telma asks a returning patient their name every single time,
-- because nothing remembers it. A clinic opening a booking cannot see that the
-- same person cancelled twice in March. And an erasure request has to sweep
-- three tables looking for a number, because there is nowhere it lives once.
--
-- ── ONE PER CLINIC, NOT ONE PER PERSON ──────────────────────────────────────
-- Keyed by (clinic_id, phone_digits). Two clinics that share a patient hold two
-- rows, and neither can see the other's. A single cross-clinic patient would be
-- a register of who goes to which clinic, held by us, which is a different and
-- much worse thing to be holding than a clinic's own list of its own patients.
--
-- ── THE LAST NINE DIGITS ────────────────────────────────────────────────────
-- The same rule 0040 uses to match an erasure: +351 912 345 678, 912345678 and
-- 00351912345678 are one person. Generated and stored, so the uniqueness is the
-- database's job rather than every caller's.
--
-- ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
-- No date of birth, no address, no notes, no clinical anything. This exists so
-- that somebody who has rung before does not have to say their name again, and
-- so the clinic can see its own history with them. Everything a clinic needs
-- beyond that already lives in the clinic's own software, which is where the
-- appointments are copied to and where that kind of record belongs.

create table if not exists patients (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  name          text not null,
  phone         text not null,
  phone_digits  text generated always as (right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 9)) stored,
  -- When Telma last heard from them. Not a visit count: a booking that was
  -- cancelled is still contact, and this is used to decide whether a record is
  -- still worth keeping.
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_patients_clinic_phone
  on patients (clinic_id, phone_digits)
  where phone_digits <> '';

create index if not exists idx_patients_clinic_seen
  on patients (clinic_id, last_seen_at desc);

-- The booking points at the person. Nullable, and the name and telephone stay
-- on the appointment: a booking has to keep saying who it was for even after
-- an erasure has emptied the patient, and a row that means nothing on its own
-- is a row that breaks every report that ever forgets to join.
alter table appointments
  add column if not exists patient_id uuid references patients(id) on delete set null;

create index if not exists idx_appointments_patient on appointments (patient_id);

alter table patients enable row level security;

-- The same shape as appointments in 0002, word for word: the clinic reads and
-- updates its own, the internal team reads everything, and writes come from
-- Telma on the service role. A patient row is exactly as sensitive as the
-- booking it belongs to, so it gets exactly the same door.
drop policy if exists patients_select on patients;
create policy patients_select on patients for select
  using (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists patients_update on patients;
create policy patients_update on patients for update
  using (public.is_internal() or clinic_id = public.current_clinic_id())
  with check (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists patients_internal_write on patients;
create policy patients_internal_write on patients for all
  using (public.is_internal()) with check (public.is_internal());

/**
 * Remember whoever just gave their name and number.
 *
 * Called when a booking is filed, which is the only moment both are known and
 * confirmed out loud. Upsert rather than insert: the same person rings again,
 * sometimes with the name spelt differently by whatever heard it, and the last
 * spelling is the one the clinic most recently agreed to.
 */
create or replace function remember_patient(
  p_clinic_id uuid,
  p_name text,
  p_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 9);
begin
  -- Nine digits or nothing. A partial number would collide with other partial
  -- numbers and quietly merge two people into one record.
  if length(v_digits) < 9 or coalesce(trim(p_name), '') = '' then
    return null;
  end if;

  insert into patients (clinic_id, name, phone)
  values (p_clinic_id, trim(p_name), p_phone)
  on conflict (clinic_id, phone_digits) where phone_digits <> ''
  do update set name = excluded.name, last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function remember_patient(uuid, text, text) from anon, authenticated;

comment on table patients is
  'One row per person per clinic, so a returning caller is not asked their '
  'name again. Erasure empties it; the appointments keep their own copy.';
