-- Row level security on the tables added since 0002, which never got any.
--
-- `resources` and `resource_services` were created in 0034 with no RLS at all.
-- On Supabase every table in `public` is reachable through PostgREST with the
-- anon key, and a table with RLS switched off is a table anybody holding a
-- session can read and write. So one clinic's user could list another clinic's
-- professionals by name, and could delete them.
--
-- Nothing in the product does that, which is why nothing went wrong and why
-- nobody noticed: the hole is only visible from outside the application, which
-- is exactly where it matters. 0002 has a loop that covers every clinic-scoped
-- table and these were added afterwards, so they fell through it.
--
-- `erasures` had RLS enabled and no policy, which denies everybody including
-- the clinic that owns the row. Safe by accident, and wrong when the panel
-- comes to show a clinic what it has erased.

alter table resources enable row level security;
alter table resource_services enable row level security;
alter table erasures enable row level security;

-- Same shape as the generic clinic-scoped policy in 0002: your own clinic, or
-- internal staff.
drop policy if exists resources_rw on resources;
create policy resources_rw on resources for all
  using (public.is_internal() or clinic_id = public.current_clinic_id())
  with check (public.is_internal() or clinic_id = public.current_clinic_id());

-- No clinic_id of its own: it hangs off the diary, so the check follows it.
drop policy if exists resource_services_rw on resource_services;
create policy resource_services_rw on resource_services for all
  using (
    exists (
      select 1 from resources r
       where r.id = resource_services.resource_id
         and (public.is_internal() or r.clinic_id = public.current_clinic_id())
    )
  )
  with check (
    exists (
      select 1 from resources r
       where r.id = resource_services.resource_id
         and (public.is_internal() or r.clinic_id = public.current_clinic_id())
    )
  );

-- Read only, and only your own. A clinic needs to show that it answered a
-- request; nobody needs to edit the record of having answered it, least of all
-- through an API call from a browser.
drop policy if exists erasures_select on erasures;
create policy erasures_select on erasures for select
  using (public.is_internal() or clinic_id = public.current_clinic_id());
