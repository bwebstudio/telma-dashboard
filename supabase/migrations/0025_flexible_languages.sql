-- Languages become a number on the plan and a choice for the clinic.
--
-- Three models were tried before this one, and each broke on the same thing.
-- Baking languages into `plans.features` as booleans meant adding German was a
-- pricing exercise. Selling each language as an add-on meant the price list
-- grew by a row per language and a clinic in Barcelona paid extra for the
-- language its patients actually speak. Both made the answer to "which
-- languages do I get" different for every plan, which is impossible to say in
-- one sentence to somebody on the phone.
--
-- This one says it in one sentence: your plan includes up to N languages,
-- choose which. Adding a language to the platform becomes one insert, and
-- nothing about pricing moves.

-- What the platform can speak -------------------------------------------------
-- Deliberately its own table and not an enum. An enum needs a migration and a
-- deploy to gain a value, and the point of this model is that a new language is
-- a row. `status` is what lets a language be announced before it works:
-- 'coming_soon' shows in the picker, greyed, which sells the roadmap without
-- promising a clinic something it cannot have this month.
create table if not exists available_languages (
  code        text primary key,
  -- Named in itself, always. A clinic choosing Catalan should read "Català",
  -- not our word for it: the endonym is the one its patients would recognise.
  name        text not null,
  -- For the panel and the internal list, which are written in one language.
  name_pt     text not null,
  name_es     text not null,
  status      text not null default 'available'
              check (status in ('available', 'coming_soon', 'deprecated')),
  -- Ordering in the picker. Lower first, so the two markets lead.
  sort_order  smallint not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_available_languages_updated on available_languages;
create trigger trg_available_languages_updated before update on available_languages
  for each row execute function set_updated_at();

insert into available_languages (code, name, name_pt, name_es, status, sort_order) values
  ('pt', 'Português', 'Português', 'Portugués', 'available',   10),
  ('es', 'Español',   'Espanhol',  'Español',   'available',   20),
  ('ca', 'Català',    'Catalão',   'Catalán',   'available',   30),
  ('en', 'English',   'Inglês',    'Inglés',    'available',   40),
  ('fr', 'Français',  'Francês',   'Francés',   'coming_soon', 50),
  ('de', 'Deutsch',   'Alemão',    'Alemán',    'coming_soon', 60),
  ('it', 'Italiano',  'Italiano',  'Italiano',  'coming_soon', 70)
on conflict (code) do update set
  name       = excluded.name,
  name_pt    = excluded.name_pt,
  name_es    = excluded.name_es,
  sort_order = excluded.sort_order,
  -- `status` is deliberately NOT updated: switching a language on is an
  -- operational decision made in the table, and re-running this migration must
  -- not switch it back off.
  updated_at = now();

alter table available_languages enable row level security;

-- The list of languages is not a secret and every signed in user needs it.
drop policy if exists available_languages_select on available_languages;
create policy available_languages_select on available_languages
  for select to authenticated using (true);

drop policy if exists available_languages_internal_write on available_languages;
create policy available_languages_internal_write on available_languages
  for all using (public.is_internal()) with check (public.is_internal());

-- How many a plan includes ----------------------------------------------------
-- Null means unlimited, and only 'personalizado' is null. The same convention
-- the rest of this table already uses for "quoted case by case".
alter table plans add column if not exists max_languages_included smallint;

update plans set max_languages_included = case id
  when 'essencial'     then 2
  when 'clinica'       then 3
  when 'rede'          then 4
  else null
end
where max_languages_included is null or id <> 'personalizado';

comment on column plans.max_languages_included is
  'How many languages this plan includes. Null means unlimited. The clinic chooses which, from available_languages.';

-- Which ones the clinic chose -------------------------------------------------
alter table clinics add column if not exists selected_languages text[] not null
  default array[]::text[];

comment on column clinics.selected_languages is
  'The languages Telma answers this clinic''s calls in. Must contain clinics.language, and no more than the plan allows.';

-- Carry across what the old models recorded. Two sources: `clinics.language`,
-- which 0024 set from the sign-up, and any `language_*` entry that had made it
-- into `active_addons` while languages were sold as add-ons.
update clinics
   set selected_languages = (
     select array_agg(distinct code)
       from (
         select coalesce(language, 'pt') as code
         union
         select replace(a, 'language_', '')
           from unnest(coalesce(active_addons, array[]::text[])) as a
          where a like 'language\\_%'
       ) s
      where code in (select code from available_languages)
   )
 where cardinality(selected_languages) = 0;

-- Languages leave the add-on list. They are no longer bought, so leaving them
-- there would show a clinic paying for something that is now included.
update clinics
   set active_addons = array(
     select a from unnest(active_addons) as a where a not like 'language\\_%'
   )
 where exists (select 1 from unnest(active_addons) as a where a like 'language\\_%');

-- And they leave the price list, for the same reason.
delete from addons where id like 'language\\_%';

-- The rules, enforced where they cannot be forgotten --------------------------
-- In a trigger and not only in the application, because the application is not
-- the only thing that writes here: the internal panel, a future bulk import and
-- any hand-run SQL all reach this table. A rule that lives in one caller is a
-- rule the next caller does not know about.
create or replace function public.validate_clinic_languages()
returns trigger language plpgsql as $$
declare
  v_max      smallint;
  v_unknown  text;
  v_base     text;
begin
  -- Nothing chosen yet: fall back to the clinic's own language rather than
  -- refusing the insert. A row that arrives without languages is one written by
  -- something that predates this column, not an error.
  if new.selected_languages is null or cardinality(new.selected_languages) = 0 then
    new.selected_languages := array[coalesce(new.language, 'pt')];
  end if;

  -- Every code has to exist and be sellable. 'coming_soon' is shown in the
  -- picker and cannot be chosen: announcing a language is not the same as
  -- having it.
  select code into v_unknown
    from unnest(new.selected_languages) as code
   where code not in (select l.code from available_languages l where l.status = 'available')
   limit 1;

  if v_unknown is not null then
    raise exception 'Language "%" is not available', v_unknown
      using errcode = 'check_violation';
  end if;

  -- The clinic's own language is the one it cannot drop. Not hardcoded to
  -- Portuguese: Telma is sold in Spain too, and forcing Portuguese on a clinic
  -- in Barcelona would spend one of its two slots on a language its patients do
  -- not speak. What must always be true is that the base language is included,
  -- and for a Portuguese clinic that base is Portuguese.
  v_base := coalesce(new.language, 'pt');
  if not (v_base = any(new.selected_languages)) then
    new.selected_languages := array_prepend(v_base, new.selected_languages);
  end if;

  -- No more than the plan allows. Null is unlimited.
  select p.max_languages_included into v_max
    from plans p where p.id = new.plan::text;

  if v_max is not null and cardinality(new.selected_languages) > v_max then
    raise exception 'Plan % includes % language(s); % were selected',
      new.plan, v_max, cardinality(new.selected_languages)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_clinics_languages on clinics;
create trigger trg_clinics_languages before insert or update on clinics
  for each row execute function public.validate_clinic_languages();

-- Capabilities ----------------------------------------------------------------
-- `check_clinic_capability(clinic, 'language_es')` is still asked by the voice
-- platform and the panel. It now answers from `selected_languages` instead of
-- from the add-on list, so callers do not have to know the model changed.
create or replace function public.check_clinic_capability(
  p_clinic_id  uuid,
  p_capability text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_id       text;
  v_active_addons text[];
  v_languages     text[];
  v_from_plan     boolean;
begin
  if p_clinic_id is null or p_capability is null then
    return false;
  end if;

  select c.plan::text,
         coalesce(c.active_addons, array[]::text[]),
         coalesce(c.selected_languages, array[]::text[])
    into v_plan_id, v_active_addons, v_languages
    from clinics c
   where c.id = p_clinic_id;

  if not found or v_plan_id is null then
    return false;
  end if;

  -- Languages are answered from the clinic's own list, whatever the plan says.
  if p_capability like 'language\_%' then
    return replace(p_capability, 'language_', '') = any(v_languages);
  end if;

  if p_capability = any(v_active_addons) then
    return true;
  end if;

  select coalesce((p.features ->> p_capability)::boolean, false)
    into v_from_plan
    from plans p
   where p.id = v_plan_id;

  return coalesce(v_from_plan, false);
end $$;

revoke execute on function public.check_clinic_capability(uuid, text) from public;
grant execute on function public.check_clinic_capability(uuid, text) to authenticated, service_role;
