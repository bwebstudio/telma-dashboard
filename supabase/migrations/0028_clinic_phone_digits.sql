-- Finding a clinic by the number that was dialled.
--
-- When a call arrives, the voice platform knows the number it came in on and
-- nothing else. Every endpoint here took a `clinic_id`, which is an identifier
-- that only exists on our side, so there was no way in from a real call.
--
-- Matching on `assigned_phone` directly does not work, and the reason is in the
-- data: the seeded clinic holds `+351 300 500 900` with spaces while the
-- sign-up writes `+34936014505` clean, and a carrier may hand over any of
-- `+34 936 014 505`, `0034936014505` or `34936014505` for the same line. Three
-- spellings on one side and two on the other is six ways to miss.
--
-- So the comparison happens on digits only, in a stored generated column, the
-- same shape `crm_prospects.phone_digits` already uses for the same reason.
-- Generated rather than maintained: a column the application has to remember to
-- update is a column that drifts the first time somebody edits a clinic in the
-- Supabase table editor.
alter table clinics add column if not exists assigned_phone_digits text
  generated always as (regexp_replace(coalesce(assigned_phone, ''), '\D', '', 'g')) stored;

comment on column clinics.assigned_phone_digits is
  'assigned_phone with everything but the digits removed. The only thing an incoming call can be matched against.';

-- Unique, because two clinics answering on one number is a call that reaches
-- the wrong diary, and it is better to fail on the second insert than to find
-- out from a patient. Partial: the many clinics with no number yet all have an
-- empty string here and must not collide with each other.
create unique index if not exists idx_clinics_assigned_phone_digits
  on clinics(assigned_phone_digits)
  where assigned_phone_digits <> '';
