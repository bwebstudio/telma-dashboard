-- Somebody cancelled, and in three months nobody could say who.
--
-- 0045 anonymised appointments that never happened — cancelled, refused,
-- expired — ninety days after their hour: the name became "Anonimizado", the
-- telephone was emptied, and the booking stayed as a slot that nobody was in.
--
-- The reasoning was that these are "noise", people who never came. It is wrong,
-- and the clinic said so in one sentence: a cancellation is a record of
-- something this patient did. Somebody who books three times and cancels three
-- times is a fact about that person, and it is the fact the fourth booking
-- should be read against. Taking the name off it after ninety days does not
-- protect anybody in particular; it deletes the clinic's own history with
-- somebody while keeping the hole where it happened.
--
-- ── SO THE LINE MOVES, AND IT IS THE SAME LINE AS EVERYWHERE ELSE ──────────
-- What happened survives: who, when, which hour, what state it ended in, who
-- called it off and the reason they gave for it. That is the clinic's record
-- of its own business and it has no expiry.
--
-- What the person said survives ninety days: `reason`, which is why they came,
-- and `summary`, which is the note from the call. Both are free text about
-- somebody's health written down by a machine listening to them, and neither is
-- ours to hold once the clinic has copied the booking into its own software.
--
-- `summary` is new to that rule and it closes a hole rather than tightening
-- anything: `calls.summary` has been cleared at ninety days since 0039, and the
-- appointment's copy of the same sentences was kept for ever two tables away.
-- One of the two was wrong and it was not the one with the deadline.

create or replace function purge_appointments() returns jsonb language plpgsql as $$
declare
  v_reason integer;
  v_summary integer;
begin
  -- The reason somebody came, at the same age as the call summary it was heard
  -- in. Every appointment, whatever became of it.
  update appointments
     set reason = null
   where reason is not null
     and scheduled_at < now() - interval '90 days';
  get diagnostics v_reason = row_count;

  -- And the note from the call, which until now was cleared only on the ones
  -- being anonymised and kept for ever on the rest.
  update appointments
     set summary = null
   where summary is not null
     and scheduled_at < now() - interval '90 days';
  get diagnostics v_summary = row_count;

  return jsonb_build_object('reasons_cleared', v_reason, 'summaries_cleared', v_summary);
end;
$$;

comment on function purge_appointments is
  'Clears the reason for the visit and the note from the call at 90 days, on '
  'every appointment. The name, the telephone, the hour, the state and who '
  'cancelled it are the clinic''s own record and are never cleared: see 0051.';

revoke execute on function purge_appointments() from anon, authenticated;

-- ── AND THE ONES ALREADY EMPTIED ────────────────────────────────────────────
-- Nothing here can bring a name back that 0045 has already written over. It has
-- been in production for days rather than months and the appointments it would
-- have reached are ninety days old, so on the demo database it has touched
-- nothing at all. Said out loud rather than left to be discovered: if a clinic
-- has an appointment reading "Anonimizado", that is this, and it is not
-- recoverable.
