-- The welcome, and the tour, happen once per person.
--
-- A column and not browser storage, because this is a fact about a person and
-- not about a browser. A clinic owner who signs up on the practice computer
-- and opens the panel on their phone that evening has already been welcomed;
-- meeting the tour a second time reads as a product that does not remember
-- them. Cleared site data would do the same.
--
-- On `users` rather than on `clinics`: a clinic with a receptionist and an
-- owner is two people, and the second one to arrive has not seen anything.
--
-- Nullable, with no default. Null means "not yet", which is also what every
-- row that already exists means: the people in here today have been using the
-- panel for months and must not be shown an introduction to it.
alter table public.users
  add column if not exists welcomed_at timestamptz;

comment on column public.users.welcomed_at is
  'When this person finished (or dismissed) the welcome tour. Null means they have not seen it.';
