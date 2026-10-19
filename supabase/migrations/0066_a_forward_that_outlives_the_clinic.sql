-- A clinic that leaves and does not undo its forward.
--
-- ── WHAT HAPPENED BEFORE THIS ──────────────────────────────────────────────
-- Cancelling is not an act the telephone network knows about. The clinic
-- stops paying, its row goes to 'cancelada', and the forward it dialled
-- months ago keeps working: its patients keep ringing the clinic's own
-- number and the operator keeps sending those calls to our shared line.
--
-- `clinic_by_own_number` excludes cancelled clinics, which is right when the
-- question is "who should answer" and wrong as the only answer here, because
-- a call that matches nothing does not stop. It falls through to the next
-- rule, which is the number that was dialled, and on a shared line that is
-- the clinic which declared `answers_direct_calls`. So a former client's
-- patient asks for an appointment and gets booked into a different clinic's
-- diary, with both clinics believing the booking is theirs.
--
-- The hole is specific: it needs a shared line, a declared owner on it, and a
-- cancelled clinic that still forwards. All three are true today.
--
-- ── THE RULE ───────────────────────────────────────────────────────────────
-- Recognising a call and agreeing to answer it are two questions. This one
-- only recognises: it finds the clinic whose number generated the call
-- whatever its status, so the call is attributed and stops falling through.
-- Whether Telma answers for a clinic in that state is decided above, in
-- /api/voice/init, where every other reason not to answer already lives.
--
-- Same body as clinic_by_own_number without the status filter, deliberately
-- kept as its own function: the original is also what decides whether a
-- direct call may be claimed, and loosening it there would let a cancelled
-- clinic claim calls again.
create or replace function clinic_by_own_number_any_status(p_number text)
returns uuid language sql stable as $$
  with want as (
    select right(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 9) as d
  )
  select c.id
    from clinics c, want
   where want.d <> ''
     and length(want.d) = 9
     and (
       right(regexp_replace(coalesce(c.porting_details->>'current_number', ''), '[^0-9]', '', 'g'), 9) = want.d
       or right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 9) = want.d
     )
   order by
     -- A clinic still with us, before one that left: if two rows carry the
     -- same digits, the live one is whose call this is.
     case when c.status <> 'cancelada' then 0 else 1 end,
     -- The number the panel told them to forward from, first.
     case
       when right(regexp_replace(coalesce(c.porting_details->>'current_number', ''), '[^0-9]', '', 'g'), 9) = want.d
         then 0
       else 1
     end,
     c.created_at
   limit 1;
$$;

revoke execute on function clinic_by_own_number_any_status(text) from anon, authenticated;
grant execute on function clinic_by_own_number_any_status(text) to service_role;
