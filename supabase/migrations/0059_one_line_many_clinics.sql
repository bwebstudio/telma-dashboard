-- One telephone line, many clinics, and still only one diary per call.
--
-- ── WHAT CHANGED IN THE WORLD ──────────────────────────────────────────────
-- 0028 made a clinic's Telma number unique, and the comment on that index
-- gave the reason: "two clinics answering on one number is a call that reaches
-- the wrong diary". That was true when the only thing we knew about an
-- incoming call was the number it was dialled on.
--
-- It stopped being true in 0057. A clinic keeps its own number and forwards
-- what it cannot answer; the network passes on the number that was originally
-- dialled, Twilio hands it to us as `ForwardedFrom`, and /api/voice/incoming
-- writes down whose call it is before the call reaches the agent. Five calls
-- out of five on a real Vodafone line, and two clinics answered at once, in
-- two languages, on one number.
--
-- So the fact that decides the diary is no longer the number dialled. The
-- index is now the thing standing between us and the design that works, and
-- it is standing there for a reason that no longer holds.
--
-- ── WHY IT IS NOT SIMPLY DROPPED ───────────────────────────────────────────
-- Because one case still has nothing but the number dialled: somebody who
-- rings the Telma line directly. No forward, no `ForwardedFrom`, nothing to
-- say which clinic they meant. Dropping the index would make that call pick a
-- clinic by whichever row the database returned first, which is exactly the
-- wrong-diary failure 0028 was written to prevent, arriving by a different
-- door and only sometimes.
--
-- So uniqueness is not removed, it is split in two:
--
--   a line a clinic has to itself   -> still unique, exactly as before
--   a line several clinics share    -> at most one of them answers direct calls
--
-- Both are unique indexes, so both are the database's promise and not a rule
-- somebody has to remember. A shared line with no declared owner is allowed,
-- and a direct call to it is refused rather than guessed.

-- ── THE LINE ───────────────────────────────────────────────────────────────
-- `phone_stock` is already the list of numbers we hold. A shared line is one
-- of them that is never taken off the shelf, because it serves everybody.
alter table public.phone_stock
  add column if not exists shared boolean not null default false;

comment on column public.phone_stock.shared is
  'Serves every clinic that forwards to it. Never claimed, so never removed from the shelf.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'phone_stock_shared_is_never_claimed'
  ) then
    alter table public.phone_stock
      add constraint phone_stock_shared_is_never_claimed
      check (not shared or (clinic_id is null and claimed_at is null));
  end if;
end $$;

create index if not exists phone_stock_shared_idx
  on public.phone_stock (country) where shared;

-- ── THE CLINIC ─────────────────────────────────────────────────────────────
alter table public.clinics
  add column if not exists assigned_phone_shared boolean not null default false;

alter table public.clinics
  add column if not exists answers_direct_calls boolean not null default false;

comment on column public.clinics.assigned_phone_shared is
  'This clinic answers on a line other clinics also answer on. Calls are told apart by ForwardedFrom.';
comment on column public.clinics.answers_direct_calls is
  'Of the clinics sharing this line, the one a call dialled straight to it belongs to.';

-- Owning the direct calls on a line you do not share is meaningless, and a
-- meaningless flag is one somebody will one day read as meaning something.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clinics_direct_calls_needs_shared_line'
  ) then
    alter table public.clinics
      add constraint clinics_direct_calls_needs_shared_line
      check (not answers_direct_calls or assigned_phone_shared);
  end if;
end $$;

-- ── THE TWO PROMISES ───────────────────────────────────────────────────────
drop index if exists idx_clinics_assigned_phone_digits;

-- As before: a line of your own is yours alone.
create unique index if not exists idx_clinics_exclusive_line
  on public.clinics (assigned_phone_digits)
  where assigned_phone_digits <> '' and not assigned_phone_shared;

-- New: on a shared line, at most one clinic answers what is dialled directly.
create unique index if not exists idx_clinics_shared_line_direct_owner
  on public.clinics (assigned_phone_digits)
  where assigned_phone_digits <> '' and assigned_phone_shared and answers_direct_calls;

-- ── THE LINE WE ALREADY HAVE ───────────────────────────────────────────────
-- Bought under the approved individual bundle, pointed at /api/voice/incoming,
-- and the only Portuguese number Twilio will sell this account until the
-- business bundle clears. It is the shared line.
insert into public.phone_stock (number, provider_ref, country, region, shared)
values ('+351300602615', 'PN4613961178d724dfaf4140a5593b17ba', 'PT', null, true)
on conflict (number) do update
  set shared = true, clinic_id = null, claimed_at = null, provider_ref = excluded.provider_ref;

-- The clinic that has been answering direct calls on it all along.
update public.clinics
   set assigned_phone_shared = true,
       answers_direct_calls = true,
       phone_provider_ref = 'PN4613961178d724dfaf4140a5593b17ba'
 where assigned_phone_digits = '351300602615';

-- ── WHAT THE SIGN-UP ASKS ──────────────────────────────────────────────────
-- A clinic keeping its own number does not need a number bought for it. It
-- needs somewhere to forward to, and that is this.
create or replace function public.shared_line_for(p_country text)
returns table (number text, provider_ref text)
language sql stable as $$
  select s.number, s.provider_ref
    from public.phone_stock s
   where s.shared
     and s.country = upper(coalesce(p_country, ''))
   order by s.created_at
   limit 1;
$$;

revoke execute on function public.shared_line_for(text) from anon, authenticated;
grant execute on function public.shared_line_for(text) to service_role;

-- ── WHO A DIRECT CALL BELONGS TO ───────────────────────────────────────────
-- Null rather than a guess. The caller hears the agent's own fallback, which
-- takes a message, instead of being booked into somebody else's clinic.
create or replace function public.clinic_by_dialled_number(p_number text)
returns uuid language sql stable as $$
  with digits as (
    select right(regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g'), 9) as d
  )
  select c.id
    from public.clinics c, digits
   where right(c.assigned_phone_digits, 9) = digits.d
     and digits.d <> ''
     and length(digits.d) = 9
     and c.status <> 'cancelada'
     -- On a shared line only the declared owner answers; on an exclusive line
     -- there is only ever one row, and the flag is false on it.
     and (not c.assigned_phone_shared or c.answers_direct_calls)
   order by c.created_at
   limit 1;
$$;

revoke execute on function public.clinic_by_dialled_number(text) from anon, authenticated;
grant execute on function public.clinic_by_dialled_number(text) to service_role;
