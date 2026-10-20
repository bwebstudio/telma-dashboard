-- The call history on a patient's record, matched on digits.
--
-- ── WHAT IT WAS DOING ──────────────────────────────────────────────────────
-- The record took the patient's last nine digits and looked for them inside
-- `calls.from_phone` as text. That works while the number arrives from the
-- telephone network, which writes +351912345678 and nothing else.
--
-- It is not the only way a number gets in there. A call that ends without a
-- booking is rescued by the post-call webhook, and the number it carries is
-- the one the caller said out loud and the agent wrote down: "912 345 678"
-- matches nothing when the needle is "912345678". The clinic then opens the
-- record of somebody who rang twice last week and reads that they have never
-- rung at all, which is worse than showing no history at all, because it
-- looks like an answer.
--
-- `patients` has had this column since 0046 and `clinics` since 0028. This is
-- the same thing on the third table that holds a telephone number: the last
-- nine digits, generated, so nothing has to remember to normalise on the way
-- in and no old row needs rewriting.
alter table public.calls
  add column if not exists from_digits text
  generated always as (right(regexp_replace(coalesce(from_phone, ''), '[^0-9]', '', 'g'), 9)) stored;

comment on column public.calls.from_digits is
  'Last nine digits of from_phone, for matching a call to a patient however the number was written.';

-- One patient's history, which is the only query that reads it.
create index if not exists idx_calls_from_digits
  on public.calls (clinic_id, from_digits);
