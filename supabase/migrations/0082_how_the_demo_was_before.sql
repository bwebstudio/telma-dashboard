-- How the demo was, before it was dressed up as somebody else.
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
-- A clinic goes live on a date somebody wrote in a calendar, and on the eve of
-- it the only question that matters is what a patient would actually hear.
-- Reading the configuration on a screen and imagining it is not an answer, and
-- ringing the clinic's own line to find out spends their minutes on a number
-- that is not ours to experiment with.
--
-- So the demo answers as them for an afternoon: their name, their hours, their
-- services and prices, the greeting they wrote. The prompt is built per call
-- from the clinic row, so copying those fields copies the whole conversation.
--
-- ── AND WHY IT HAS TO BE UNDOABLE ──────────────────────────────────────────
-- Because otherwise it is not temporary. The demo is the thing we show people,
-- and a demo left answering as last week's client is worse than one that was
-- never dressed up: nobody notices until it is in front of somebody.
--
-- Knowing what to put back is the whole problem. The fields are spread across
-- a wide row and a second table, and "I think the hours were nine to six"
-- is how a demo quietly stops matching what we sell. So the row and its hours
-- are written down here first, whole, and putting them back is one command.
--
-- Internal, and never read by the panel: see scripts/demo-as-clinic.mjs.
create table if not exists clinic_snapshots (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  taken_at   timestamptz not null default now(),
  -- What it was taken before, in words, so a list of three is readable.
  note       text,
  -- The row as it stood, and the opening hours, which live in their own table
  -- and are half of what Telma says: "we are closed, we open at eight" comes
  -- from there and from nowhere else.
  clinic     jsonb not null,
  hours      jsonb not null default '[]'::jsonb
);

create index if not exists idx_clinic_snapshots_clinic
  on clinic_snapshots (clinic_id, taken_at desc);

alter table clinic_snapshots enable row level security;

-- No clinic policy at all, deliberately. This holds a whole clinic row, which
-- is the one thing a clinic must never be able to read about another, and the
-- only thing that writes or reads it is a script on the service role.
drop policy if exists clinic_snapshots_internal on clinic_snapshots;
create policy clinic_snapshots_internal on clinic_snapshots for all
  using (public.is_internal()) with check (public.is_internal());

comment on table clinic_snapshots is
  'A clinic row and its opening hours, kept so that dressing the demo up as a '
  'real client can be undone exactly. See scripts/demo-as-clinic.mjs.';
