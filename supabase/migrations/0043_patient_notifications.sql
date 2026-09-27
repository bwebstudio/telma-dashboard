-- Telling the patient what the clinic decided.
--
-- Telma tells them the booking is "subject to the clinic confirming it", and
-- until now that confirmation never reached them: the clinic pressed a button
-- in the panel and the patient found out by turning up, or did not turn up. A
-- competitor sends a message the moment it happens, and that is the whole of
-- the difference a patient can see.
--
-- Three columns and not a table. What is worth keeping is: did we send one, on
-- which channel, and what went wrong if it failed. That belongs to the
-- appointment the way `decided_at` does, and a row per message would be a
-- second thing to join, to purge on erasure, and to keep in step with RLS.
--
-- `notified_at` is also what stops a second send: a clinic that confirms, then
-- moves the hour, then confirms again has one patient who should get two
-- messages about two different things and not four about the same one. The
-- check is on the pair, so moving an hour sends again and confirming twice
-- does not.

alter table appointments
  add column if not exists notified_at      timestamptz,
  add column if not exists notified_channel text,
  add column if not exists notified_kind    text,
  add column if not exists notify_error     text;

comment on column appointments.notified_at is
  'When the patient was last told what the clinic decided. Null means never.';
comment on column appointments.notified_channel is
  'sms or whatsapp. Which one depends on the add-on the clinic pays for.';
comment on column appointments.notified_kind is
  'confirmada, alterada or rejeitada: what the last message was about.';
comment on column appointments.notify_error is
  'Twilio''s own words when the last attempt failed. Kept so a clinic can be '
  'told the patient never heard, rather than the failure being silent.';

-- Which ones did not reach anybody. A clinic confirming a booking has to be
-- able to see that the message bounced, and this is what the panel reads.
create index if not exists idx_appointments_notify_failed
  on appointments (clinic_id, decided_at desc)
  where notify_error is not null;
