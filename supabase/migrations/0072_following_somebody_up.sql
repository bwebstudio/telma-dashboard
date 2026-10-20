-- Following a patient up, which is what the notes were really for.
--
-- ── WHAT THE FIRST CLINIC ACTUALLY ASKED FOR ───────────────────────────────
-- Not a notepad. They want to know, for a person: how many times we rang
-- back, whether anybody answered, whether this is still open, and what is
-- waiting on what. A free text field answers none of those without somebody
-- reading every line of it.
--
-- So an entry has a kind. A note is a note. A contact attempt also records
-- whether the person was reached, which is the fact the whole thing turns on
-- and the one nobody writes down consistently in prose.
alter table public.patient_notes
  add column if not exists kind text not null default 'nota'
    check (kind in ('nota', 'contacto')),
  -- Null on a note, because "was anybody reached" is not a question about a
  -- note. True or false on an attempt, and never null there.
  add column if not exists reached boolean,
  add constraint patient_notes_reached_only_on_contact
    check (kind = 'contacto' or reached is null);

comment on column public.patient_notes.kind is
  'nota: something the clinic wrote. contacto: an attempt to reach the person, with reached true or false.';

-- ── AND WHETHER ANYTHING IS STILL OPEN ─────────────────────────────────────
-- On the patient and not on an entry, because "is there anything pending with
-- this person" is a question about the person. Derived from the entries it
-- would have to be recomputed on every list, and the one list that matters is
-- "who are we still waiting on", which has to be cheap.
--
-- A timestamp and not a boolean: "pending since the 3rd" is what a receptionist
-- needs on a Monday morning, and a true/false cannot say it.
alter table public.patients
  add column if not exists follow_up_since timestamptz,
  add column if not exists follow_up_reason text;

comment on column public.patients.follow_up_since is
  'When a follow-up was opened on this person. Null means nothing is pending.';

-- The list of who is still open, per clinic, oldest first.
create index if not exists idx_patients_follow_up
  on public.patients (clinic_id, follow_up_since)
  where follow_up_since is not null;
