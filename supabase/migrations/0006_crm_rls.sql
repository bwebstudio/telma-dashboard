-- Row Level Security for the sales CRM.
--
-- Rule: a rep reads and writes only prospects assigned to them, plus the
-- unassigned ones in their own country (so they can pick up new leads).
-- A prospect belonging to another rep is invisible. The internal team
-- (users.role = 'interno') reads and writes everything.

-- Helpers. security definer so they can read users / crm_reps without being
-- blocked by those tables' own policies.
create or replace function public.crm_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'interno'
  );
$$;

create or replace function public.crm_is_rep()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crm_reps where id = auth.uid() and active
  );
$$;

create or replace function public.crm_rep_country()
returns crm_country language sql stable security definer set search_path = public as $$
  select country from public.crm_reps where id = auth.uid() and active;
$$;

-- True when the current user may open this prospect. Used by the child tables
-- so contacts and activities inherit exactly the prospect's visibility.
create or replace function public.crm_can_see_prospect(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.crm_is_admin() or (
    public.crm_is_rep() and exists (
      select 1 from public.crm_prospects p
      where p.id = p_id
        and (
          p.rep_id = auth.uid()
          or (p.rep_id is null and p.country = public.crm_rep_country())
        )
    )
  );
$$;

alter table crm_reps      enable row level security;
alter table crm_prospects enable row level security;
alter table crm_contacts  enable row level security;
alter table crm_activities enable row level security;

-- REPS ----------------------------------------------------------------------
-- Everyone inside the CRM can read the roster (needed to show "assigned to
-- Sonia" on a duplicate warning). Only the internal team creates or edits.
drop policy if exists crm_reps_select on crm_reps;
create policy crm_reps_select on crm_reps for select
  using (public.crm_is_admin() or public.crm_is_rep());

drop policy if exists crm_reps_admin on crm_reps;
create policy crm_reps_admin on crm_reps for all
  using (public.crm_is_admin()) with check (public.crm_is_admin());

-- PROSPECTS -----------------------------------------------------------------
drop policy if exists crm_prospects_select on crm_prospects;
create policy crm_prospects_select on crm_prospects for select
  using (
    public.crm_is_admin() or (
      public.crm_is_rep() and (
        rep_id = auth.uid()
        or (rep_id is null and country = public.crm_rep_country())
      )
    )
  );

-- A rep creates a prospect for themselves, or leaves it unassigned.
drop policy if exists crm_prospects_insert on crm_prospects;
create policy crm_prospects_insert on crm_prospects for insert
  with check (
    public.crm_is_admin() or (
      public.crm_is_rep() and (rep_id = auth.uid() or rep_id is null)
    )
  );

-- A rep may edit their own, and may take an unassigned one in their country
-- (the with check keeps them from handing it to somebody else).
drop policy if exists crm_prospects_update on crm_prospects;
create policy crm_prospects_update on crm_prospects for update
  using (
    public.crm_is_admin() or (
      public.crm_is_rep() and (
        rep_id = auth.uid()
        or (rep_id is null and country = public.crm_rep_country())
      )
    )
  )
  with check (
    public.crm_is_admin() or (
      public.crm_is_rep() and (rep_id = auth.uid() or rep_id is null)
    )
  );

drop policy if exists crm_prospects_delete on crm_prospects;
create policy crm_prospects_delete on crm_prospects for delete
  using (public.crm_is_admin());

-- CONTACTS and ACTIVITIES ---------------------------------------------------
-- Same reach as the prospect they hang from.
drop policy if exists crm_contacts_all on crm_contacts;
create policy crm_contacts_all on crm_contacts for all
  using (public.crm_can_see_prospect(prospect_id))
  with check (public.crm_can_see_prospect(prospect_id));

drop policy if exists crm_activities_select on crm_activities;
create policy crm_activities_select on crm_activities for select
  using (public.crm_can_see_prospect(prospect_id));

-- Activities are an append only log: a rep signs their own entries and cannot
-- rewrite history afterwards.
drop policy if exists crm_activities_insert on crm_activities;
create policy crm_activities_insert on crm_activities for insert
  with check (
    public.crm_can_see_prospect(prospect_id)
    and (public.crm_is_admin() or rep_id = auth.uid())
  );

drop policy if exists crm_activities_admin on crm_activities;
create policy crm_activities_admin on crm_activities for all
  using (public.crm_is_admin()) with check (public.crm_is_admin());

-- Duplicate detection -------------------------------------------------------
-- Runs as security definer on purpose: a rep must be warned that a clinic is
-- already worked by a colleague even though RLS hides that row from them.
-- It returns the bare minimum needed for the warning, never the full record.
create or replace function public.crm_find_duplicates(p_name text, p_phone text)
returns table (
  kind      text,
  id        uuid,
  name      text,
  zone      text,
  phone     text,
  rep_name  text,
  stage     text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name   text := lower(trim(coalesce(p_name, '')));
begin
  if not (public.crm_is_admin() or public.crm_is_rep()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_digits) < 6 and length(v_name) < 3 then
    return;
  end if;

  return query
    select 'prospect'::text, p.id, p.name, p.zone, p.phone,
           r.full_name, p.stage::text
    from crm_prospects p
    left join crm_reps r on r.id = p.rep_id
    where (length(v_digits) >= 6 and p.phone_digits = v_digits)
       or (length(v_name) >= 3 and lower(p.name) like '%' || v_name || '%')
    order by p.created_at desc
    limit 5;

  return query
    select 'client'::text, c.id, c.name, null::text, c.phone,
           null::text, c.status::text
    from clinics c
    where (length(v_digits) >= 6 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits)
       or (length(v_name) >= 3 and lower(c.name) like '%' || v_name || '%')
    order by c.created_at desc
    limit 5;
end $$;

-- Functions are executable by PUBLIC by default, so the grant is narrowed
-- explicitly. The function also checks the caller's role itself.
revoke execute on function public.crm_find_duplicates(text, text) from public;
revoke execute on function public.crm_find_duplicates(text, text) from anon;
grant execute on function public.crm_find_duplicates(text, text) to authenticated;
