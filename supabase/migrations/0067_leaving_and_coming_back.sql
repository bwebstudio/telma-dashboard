-- Pausing, leaving, and being forgotten.
--
-- Three different things, and the panel could do none of them. A clinic that
-- wanted to stop had to write to us; one that wanted its data gone had no
-- answer at all, which is a right it has and not a favour we do.
--
-- ── WHY A PAUSE IS NOT A CANCELLATION ──────────────────────────────────────
-- A clinic that closes for August is not leaving. Without a pause it has to
-- cancel and sign up again, losing its number -- the hardest thing in this
-- product to buy -- its timetable and its history. Stripe stops collecting,
-- we stop answering, and on the date it chose everything is as it was.
--
-- ── WHY LEAVING TAKES UNTIL THE END OF THE MONTH ───────────────────────────
-- The clinic paid for it. It also needs those days: cancelling does not undo
-- the forward on its line, and a clinic whose patients reach an engaged tone
-- the same afternoon it pressed a button has been punished for leaving.
--
-- ── WHY BEING FORGOTTEN TAKES THIRTY DAYS ──────────────────────────────────
-- Everything here is somebody's medical appointment, and the person pressing
-- the button is rarely the person who will miss it. A month is long enough
-- for a clinic that changed its mind, or whose receptionist pressed it in
-- anger, and short enough to be a real answer to "delete my data".
--
-- The invoices are the exception and they are not ours to delete: six to ten
-- years of tax retention, depending on the country. What goes is everything
-- that identifies anybody -- patients, calls, recordings, appointments -- and
-- what stays is amounts and tax fields with no name attached.
alter table public.clinics
  -- A pause the clinic asked for, and the day it ends. Distinct from the
  -- status: 'pausada' is also an invoice that has not landed, and the panel
  -- has to tell a holiday apart from a payment problem.
  add column if not exists service_paused_until date,
  add column if not exists cancel_requested_at timestamptz,
  -- The day the service actually stops: the end of what was paid for.
  add column if not exists cancel_effective_at timestamptz,
  -- Optional, and never shown to anybody but us.
  add column if not exists cancel_reason text,
  -- The clock on being forgotten. Null means nobody asked, or they changed
  -- their mind, which is the same state and must stay reversible.
  add column if not exists deletion_requested_at timestamptz;

comment on column public.clinics.service_paused_until is
  'The day a clinic-requested pause ends. Null when the pause is ours (an unpaid invoice) or when there is none.';
comment on column public.clinics.deletion_requested_at is
  'When erasure was asked for. The sweep acts thirty days later; clearing this cancels it.';

-- Anything with a clock on it is read by a sweep that runs once a day over
-- every clinic. Two partial indexes so that sweep reads the handful of rows
-- that have one rather than the whole table.
create index if not exists idx_clinics_pause_ending
  on public.clinics (service_paused_until)
  where service_paused_until is not null;

create index if not exists idx_clinics_awaiting_erasure
  on public.clinics (deletion_requested_at)
  where deletion_requested_at is not null;
