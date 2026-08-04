-- "I have seen this one."
--
-- A cancellation stays in the alert band until somebody says they know about
-- it. Before this, it aged out after 24 hours whether or not anyone had read
-- it — which is the wrong end to solve it from: the band either nags about
-- something already handled, or drops something nobody saw. Both teach the
-- reader to ignore it.
--
-- Null means unread. It is a timestamp rather than a boolean because knowing
-- when the clinic noticed is worth having the first time a patient says they
-- cancelled and nobody called them back.
alter table appointments add column if not exists cancel_seen_at timestamptz;

-- The band's query: this clinic's cancellations that nobody has acknowledged.
create index if not exists idx_appts_cancel_unseen
  on appointments(clinic_id, cancelled_at desc)
  where status = 'cancelada' and cancel_seen_at is null;
