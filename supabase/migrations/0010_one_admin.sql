-- One administrator, and sales is only sales.
--
-- Until now somebody could be internal and a sales rep at the same time:
-- Domingos ran the team and also spent the day calling clinics, so he carried
-- role = 'interno'. That role is not a rank, it is a key: it opens the client
-- operation — minutes, phone numbers, the voice configuration of every paying
-- clinic — and it makes every prospect in every country visible.
--
-- A rep needs none of that to sell. From here there is exactly one internal
-- account, info@bwebstudio.com, and everybody else on the sales team is
-- 'comercial': their own prospects, their own country, nothing else.

-- 1. The administrator. The account has to exist in Supabase Auth and in
--    public.users first; this only makes sure it carries the internal role.
update public.users
set role = 'interno'
where lower(email) = 'info@bwebstudio.com';

-- 2. Anybody else who was internal and also carries a rep row is a rep, and
--    only a rep. Their prospects, activities and history are untouched: the
--    crm_reps row is what those point at, and it stays exactly as it was.
update public.users u
set role = 'comercial'
where u.role = 'interno'
  and lower(coalesce(u.email, '')) <> 'info@bwebstudio.com'
  and exists (select 1 from public.crm_reps r where r.id = u.id);

-- 3. An internal account with no rep row and no admin email is somebody who
--    was given the operation without anyone deciding to. Left alone on
--    purpose: demoting it blindly could lock out a real administrator. It is
--    listed here so it is looked at by hand.
do $$
declare leftover text;
begin
  select string_agg(coalesce(email, id::text), ', ')
    into leftover
  from public.users
  where role = 'interno' and lower(coalesce(email, '')) <> 'info@bwebstudio.com';

  if leftover is not null then
    raise warning 'Still internal besides info@bwebstudio.com: %. Review each one and set role = ''comercial'' or ''clinica'' if it should not reach the client operation.', leftover;
  end if;
end $$;

-- 4. Refuse to leave the panel with nobody who can run it.
do $$ begin
  if not exists (select 1 from public.users where role = 'interno') then
    raise exception 'No internal account left. Create info@bwebstudio.com in Supabase Auth, insert its row in public.users, then run this migration again.';
  end if;
end $$;
