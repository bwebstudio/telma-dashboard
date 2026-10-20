-- Notes on a patient, one after another instead of one over the other.
--
-- ── WHY A SINGLE FIELD WAS WRONG ───────────────────────────────────────────
-- The record had one note, which means every new thing a clinic learns about
-- somebody is written by deleting what it learned last time. "Prefers the
-- morning" and "nervous in the chair" and "owes for the x-ray" are three
-- facts, written months apart, and a textarea makes the clinic choose which
-- of them survives. Over a year the field either becomes a wall of text with
-- no dates in it, or it holds only the most recent thing anybody typed.
--
-- So: one row per note, with the day it was written, newest first.
--
-- ── WHAT STAYS TRUE ────────────────────────────────────────────────────────
-- This is still the one thing on a patient's record that Telma is never
-- given. It is the clinic talking to itself about a person, and a model that
-- can be asked to read something aloud must never be able to read these.
--
-- And it dies with the patient: `erase_patient` deletes the row in `patients`
-- and the cascade takes these with it, so the right to be forgotten does not
-- have to learn about a new table.
create table if not exists public.patient_notes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_patient_notes_patient
  on public.patient_notes (patient_id, created_at desc);

alter table public.patient_notes enable row level security;

-- The same door as `patients` in 0046, word for word: the clinic reads its
-- own, the internal team reads everything, and the writes come through the
-- panel on the service role.
drop policy if exists patient_notes_select on public.patient_notes;
create policy patient_notes_select on public.patient_notes for select
  using (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists patient_notes_internal_write on public.patient_notes;
create policy patient_notes_internal_write on public.patient_notes for all
  using (public.is_internal()) with check (public.is_internal());

-- ── WHAT WAS ALREADY WRITTEN ───────────────────────────────────────────────
-- Moved rather than left behind. A clinic that typed something into the old
-- field must find it on the record afterwards, dated the day the record was
-- last touched, which is the closest honest date there is.
insert into public.patient_notes (clinic_id, patient_id, body, created_at)
select p.clinic_id, p.id, btrim(p.notes), coalesce(p.last_seen_at, p.created_at, now())
  from public.patients p
 where p.notes is not null
   and length(btrim(p.notes)) > 0
   and not exists (select 1 from public.patient_notes n where n.patient_id = p.id);

comment on column public.patients.notes is
  'Superseded by patient_notes in 0071 and no longer written. Kept so the move can be checked against it.';
