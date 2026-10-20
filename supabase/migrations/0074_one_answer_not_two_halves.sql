-- Taking the message and ringing back were one answer told as two.
--
-- `fallback_policy` offered three: put the call through, take a message, or
-- say the clinic will ring back. The last two describe the same minute of the
-- same call. Telma writes down who rang and why, it lands in the panel, and
-- somebody rings them back: that is what happens under either one, and a
-- clinic choosing between them was being asked to guess which half the other
-- option left out. The first real client said so in those words.
--
-- So there are two now, and the fork between them is the honest one: does a
-- telephone ring while the caller is still on the line, or does it not.
--
-- 'callback' becomes 'message', which is the value that already meant the
-- whole of it. Nothing is lost: a clinic on 'callback' now also gets the
-- message written down, which is what it already believed it had.

update clinics set fallback_policy = 'message' where fallback_policy = 'callback';

alter table clinics drop constraint if exists clinics_fallback_policy_check;
alter table clinics add constraint clinics_fallback_policy_check
  check (fallback_policy in ('transfer', 'message'));

comment on column clinics.fallback_policy is
  'transfer: put the caller through to fallback_number. message: take the message, leave it in the panel, and say the clinic will ring back.';
