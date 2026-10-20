-- A clinic that does not want Telma giving out hours.
--
-- ── WHY THIS IS NOT A PLAN OR A STATUS ─────────────────────────────────────
-- Telma already stops booking for three reasons: the clinic has not finished
-- setting up, the invoice did not land, or the month's minutes are gone. All
-- three are temporary and none of them is a decision. The first real client
-- made the fourth one explicit on day one: "iria que para já faríamos apenas
-- este formato, sem mais informações extra. O importante será atender ao 6º
-- toque e registar a informação na plataforma". They want the messages taken
-- and written down, and they do not want a diary touched by anybody but them
-- until they trust the thing.
--
-- Without this column Telma would have offered their patients appointments
-- from the first call, which is the opposite of what they asked for, and the
-- only way to stop her would have been to leave the clinic unconfigured --
-- that is, to make the product look broken on purpose.
--
-- Default true, because booking is what this is for and a clinic that says
-- nothing means the thing it is paying for.
alter table clinics
  add column if not exists takes_bookings boolean not null default true;

comment on column clinics.takes_bookings is
  'False: Telma answers, informs and takes messages, and never offers an hour. Not a state -- the clinic chose it, and it can change it in the panel.';
