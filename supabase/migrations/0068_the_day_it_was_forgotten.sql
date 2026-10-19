-- When a clinic's data was destroyed.
--
-- The row survives its own erasure, emptied of everything that names anybody,
-- because the invoices we are obliged to keep for six to ten years point at
-- it: a receipt pointing at nothing is not a record of anything. So the row
-- has to be able to say what it is -- not a clinic, the remains of one -- and
-- when it stopped being one.
--
-- It is also the answer to "when was this done", which is the question asked
-- by the person who requested it and by anybody auditing that we honoured it.
alter table public.clinics
  add column if not exists deleted_at timestamptz;

comment on column public.clinics.deleted_at is
  'When this clinic''s data was erased. The row is kept, emptied, because the invoices point at it.';
