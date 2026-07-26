-- Row Level Security
-- Rule: a clinic user reads and writes only rows of its own clinic_id.
-- The internal team (role = interno) reads and writes everything.
-- The voice webhooks use the service role key, which bypasses RLS entirely.

-- Helper functions. security definer so they can read public.users without
-- being blocked by the users table policies (avoids recursion).
create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'interno'
  );
$$;

create or replace function public.current_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from public.users where id = auth.uid();
$$;

-- Enable RLS ---------------------------------------------------------------
alter table clinics             enable row level security;
alter table users               enable row level security;
alter table availability_slots  enable row level security;
alter table blocked_days        enable row level security;
alter table calls               enable row level security;
alter table appointments        enable row level security;
alter table slot_locks          enable row level security;
alter table usage               enable row level security;
alter table activity_log        enable row level security;

-- USERS --------------------------------------------------------------------
drop policy if exists users_select on users;
create policy users_select on users for select
  using (id = auth.uid() or public.is_internal());

drop policy if exists users_update_self on users;
create policy users_update_self on users for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_internal_all on users;
create policy users_internal_all on users for all
  using (public.is_internal()) with check (public.is_internal());

-- CLINICS ------------------------------------------------------------------
drop policy if exists clinics_select on clinics;
create policy clinics_select on clinics for select
  using (public.is_internal() or id = public.current_clinic_id());

drop policy if exists clinics_internal_write on clinics;
create policy clinics_internal_write on clinics for all
  using (public.is_internal()) with check (public.is_internal());

-- Generic clinic scoped tables ---------------------------------------------
-- Full management (select/insert/update/delete) for own clinic or internal.
do $$
declare t text;
begin
  foreach t in array array['availability_slots','blocked_days'] loop
    execute format('drop policy if exists %1$s_rw on %1$s', t);
    execute format(
      'create policy %1$s_rw on %1$s for all using (public.is_internal() or clinic_id = public.current_clinic_id()) with check (public.is_internal() or clinic_id = public.current_clinic_id())',
      t);
  end loop;
end $$;

-- APPOINTMENTS: clinic can read and update (confirm / alter / reject) its own.
-- Inserts come from Telma (service role) or the internal team.
drop policy if exists appts_select on appointments;
create policy appts_select on appointments for select
  using (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists appts_update on appointments;
create policy appts_update on appointments for update
  using (public.is_internal() or clinic_id = public.current_clinic_id())
  with check (public.is_internal() or clinic_id = public.current_clinic_id());

drop policy if exists appts_internal_write on appointments;
create policy appts_internal_write on appointments for all
  using (public.is_internal()) with check (public.is_internal());

-- READ ONLY for clinic users: calls, usage, activity, slot_locks.
-- Writes to these happen through the service role (webhooks / RPC).
do $$
declare t text;
begin
  foreach t in array array['calls','usage','activity_log','slot_locks'] loop
    execute format('drop policy if exists %1$s_select on %1$s', t);
    execute format(
      'create policy %1$s_select on %1$s for select using (public.is_internal() or clinic_id = public.current_clinic_id())',
      t);
    execute format('drop policy if exists %1$s_internal_write on %1$s', t);
    execute format(
      'create policy %1$s_internal_write on %1$s for all using (public.is_internal()) with check (public.is_internal())',
      t);
  end loop;
end $$;

-- Realtime: broadcast row changes so the clinic HOJE screen updates live.
do $$ begin
  alter publication supabase_realtime add table appointments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table calls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table activity_log;
exception when duplicate_object then null; end $$;
