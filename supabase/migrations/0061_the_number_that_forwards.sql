-- The number a clinic forwards from is the number we must recognise.
--
-- ── THE GAP ────────────────────────────────────────────────────────────────
-- A clinic gives us two telephone numbers at sign-up and they are not the
-- same question:
--
--   clinics.phone                      step 2, "the clinic's telephone"
--   porting_details.current_number     step 3, "the number you will forward"
--
-- The form prefills the second from the first, so they usually match and the
-- difference never showed. They are separate fields though, and a clinic with
-- a mobile for contact and a landline on the door will quite reasonably put
-- one in each.
--
-- Everything downstream then disagrees with itself. The forwarding card in
-- the panel prints `current_number` and tells the clinic to forward from it.
-- `clinic_by_own_number`, which is what turns an incoming `ForwardedFrom`
-- into a clinic, matched only `clinics.phone`. So a clinic that did exactly
-- what the panel asked produced calls that matched nothing, and the caller
-- reached an agent that did not know whose clinic it was.
--
-- It matters more now than it used to. Before 0059 the Telma number was the
-- clinic's own line and could identify the call by itself; on a shared line
-- `ForwardedFrom` is the only evidence there is.
--
-- ── THE RULE ───────────────────────────────────────────────────────────────
-- Recognise both, and prefer the one the clinic was actually told to forward
-- from. The order matters when two clinics have the same digits in different
-- fields: the forwarding number wins, because it is the one that generated
-- this call.
create or replace function clinic_by_own_number(p_number text)
returns uuid language sql stable as $$
  with want as (
    select right(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 9) as d
  )
  select c.id
    from clinics c, want
   where want.d <> ''
     and length(want.d) = 9
     and c.status <> 'cancelada'
     and (
       right(regexp_replace(coalesce(c.porting_details->>'current_number', ''), '[^0-9]', '', 'g'), 9) = want.d
       or right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 9) = want.d
     )
   order by
     -- The number the panel told them to forward from, first.
     case
       when right(regexp_replace(coalesce(c.porting_details->>'current_number', ''), '[^0-9]', '', 'g'), 9) = want.d
         then 0
       else 1
     end,
     c.created_at
   limit 1;
$$;

revoke execute on function clinic_by_own_number(text) from anon, authenticated;
