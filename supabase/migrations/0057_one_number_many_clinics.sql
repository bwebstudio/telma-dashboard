-- Which clinic a ringing telephone belongs to, when the number is shared.
--
-- ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
-- A clinic keeps its own number and forwards what it cannot answer to Telma.
-- Nobody ever dials Telma's number: it is the hidden end of that forward. So
-- the number is pure cost, one per clinic, and in Portugal it is the hardest
-- thing in the whole product to buy -- days of waiting, a regulatory bundle,
-- and a support desk that now says individuals cannot order more.
--
-- The network already carries the answer. When a telephone forwards a call it
-- passes on the number that was originally dialled, and Twilio hands it over
-- as `ForwardedFrom`. Tested on a real Vodafone Portugal line, through two
-- different forwarding codes, across a Spain-to-Portugal leg: five calls out
-- of five arrived carrying the clinic's own number.
--
-- What does not carry it is the platform. The number points straight at
-- ElevenLabs, and ElevenLabs passes us the number that was dialled and the
-- caller's, and nothing else. So the fact exists for exactly one hop and then
-- is thrown away.
--
-- ── WHAT THIS TABLE IS ─────────────────────────────────────────────────────
-- The place to put that fact for the few seconds between the two hops.
--
-- The call now arrives at us first. We read `ForwardedFrom`, work out whose
-- clinic it is, write it down against the call's own id, and hand the call
-- straight on to ElevenLabs. A moment later ElevenLabs asks us who is calling
-- and which clinic to be, quoting that same call id, and the answer is here.
--
-- Rows are worthless after the call starts and are swept at a day old. Keeping
-- them longer would be keeping a record of who rang which clinic and when,
-- which is a thing we would then have to answer for.
create table if not exists call_routes (
  call_sid   text primary key,
  clinic_id  uuid not null references clinics(id) on delete cascade,
  -- The number that was originally dialled, kept for reading a failure later:
  -- "this call came in forwarded from a number no clinic claims".
  forwarded_from text,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_routes_created on call_routes(created_at);

-- Swept by the daily job, with the rest of the retention.
create or replace function purge_call_routes() returns integer language plpgsql as $$
declare v_count integer;
begin
  delete from call_routes where created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end $$;

revoke execute on function purge_call_routes() from public;
grant execute on function purge_call_routes() to service_role;

-- ── FINDING A CLINIC BY THE NUMBER ITS PATIENTS DIAL ───────────────────────
-- Not the same as `assigned_phone`, which is the Telma line. This is the
-- clinic's own number: the one on its door, in Google, on the cards, and the
-- one a patient actually rings.
--
-- Matched on the last nine digits, the way every other telephone in this
-- system is matched, because the same line is written +351 210 000 000 in one
-- field and 00351210000000 in another by people who are both right.
create or replace function clinic_by_own_number(p_number text)
returns uuid language sql stable as $$
  select c.id
    from clinics c
   where right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 9)
       = right(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 9)
     and coalesce(c.phone, '') <> ''
     and length(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g')) >= 9
     and c.status <> 'cancelada'
   order by c.created_at
   limit 1;
$$;

revoke execute on function clinic_by_own_number(text) from anon, authenticated;
