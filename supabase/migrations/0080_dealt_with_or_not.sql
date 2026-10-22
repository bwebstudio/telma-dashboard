-- Whether anybody has dealt with this call, readable without opening anything.
--
-- ── WHAT RECEPTION ACTUALLY DOES WITH THE DAY ──────────────────────────────
-- They read it from the top and ask one question of every line: has somebody
-- taken care of this? Until now the answer was only inside the person's
-- record, one click and one back button per call, and on a morning with
-- fifteen messages nobody does that fifteen times. So the list could be read
-- but not worked through, which is the one thing it exists for.
--
-- ── WHY ON THE CALL AND NOT ON THE PERSON ──────────────────────────────────
-- Because it is a different sentence. "This person still owes us something"
-- is the follow-up on their record, and it outlives any one call. "This call
-- has been dealt with" is about the call: somebody rang on Tuesday at ten,
-- somebody else sorted it out at eleven, and the line can go quiet. A person
-- can have both at once and neither contradicts the other.
--
-- The attempts counter from 0078 sits beside it rather than inside it: how
-- many times we rang back is the work, and this is whether the work is over.
alter table calls
  add column if not exists handled_at timestamptz;

comment on column calls.handled_at is
  'When the clinic marked this call as dealt with. Null means it is still on the day''s list of things to do.';

-- The day screen reads "what is still open today" on every load.
create index if not exists idx_calls_unhandled
  on calls (clinic_id, created_at desc)
  where handled_at is null;
