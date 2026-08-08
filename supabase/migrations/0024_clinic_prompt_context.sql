-- What the agent has to be told about this clinic.
--
-- The design this app was built around is one generic agent that asks who it is
-- speaking for at the start of each call: that is what `/api/clinic-context`
-- has been for since 0001. An agent per specialty contradicts it, and it breaks
-- on the first customer that is not one of the specialties we thought of. A
-- construction company is not a dental clinic, and it does not need its own
-- agent: it needs the same agent, told what it does.
--
-- Two columns were missing for that to work.

-- What the clinic says it does, in its own words -----------------------------
-- Step 3 of the sign-up has always asked for this ("Otros servicios", free
-- text, one per line) and the answer was being dropped on the floor. For a
-- dental clinic that is a small loss, because the checkbox list already covers
-- most of it. For anything outside the four specialties it is the whole answer:
-- it is the only place a physiotherapist, a law firm or a builder ever gets to
-- say what somebody might be ringing about.
alter table clinics add column if not exists custom_services text;

comment on column clinics.custom_services is
  'Free text from step 3 of the sign-up: services the checkbox list does not cover. Read into the agent prompt.';

-- What Telma answers in ------------------------------------------------------
-- Not the same as the language the sign-up was filled in, which lives in
-- `users.locale` and decides what the panel looks like. This is what the caller
-- hears, and the two genuinely differ: a clinic in Barcelona may do its
-- paperwork in Spanish and want its patients answered in Catalan.
--
-- Defaults to Portuguese to match `timezone`, and is backfilled below from the
-- country each existing clinic is actually in, because a default that is wrong
-- for half the rows is worse than no default.
alter table clinics add column if not exists language text not null default 'pt';

comment on column clinics.language is
  'The language Telma speaks to callers in. Distinct from users.locale, which is the language of the panel.';

update clinics
   set language = 'es'
 where language = 'pt'
   and region like 'es-%';
