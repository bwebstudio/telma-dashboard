-- What Telma sells, written down where the app can read it.
--
-- Until now the plan was an enum on `clinics` and everything it implied (how
-- many minutes, how many sedes, whether WhatsApp is on) lived in the landing
-- page copy and in people's heads. That is why the panel and the price list
-- could disagree. These three tables are the single place the answer lives:
-- `plans` for what a subscription includes, `addons` for what can be bought on
-- top, `minute_packs` for what to buy when the minutes run out.
--
-- Prices are EUR, without IVA, no minimum term. The `stripe_price_id` columns
-- are left null on purpose: they get filled once the products exist in Stripe,
-- and nothing here should block on that.
--
-- Numbering note: this is the third 0009 the plan document asked for. 0009 to
-- 0013 were already taken by shipped migrations, so the plans work starts at
-- 0014 and keeps the document's order (plans, then clinics, then usage).

-- Plans ---------------------------------------------------------------------
-- The id is text and matches the existing `plan_type` enum values, so a clinic
-- row joins to its plan with `clinics.plan::text = plans.id`. No foreign key:
-- the enum is already the constraint, and an FK would mean two places to edit
-- when a plan is added.
--
-- Everything except id and name is nullable because 'personalizado' has no
-- fixed anything: it is quoted case by case. Null here reads as "ask us", not
-- as "zero", and the app must treat it that way.
create table if not exists plans (
  id                          text primary key,
  name                        text not null,
  description                 text,
  price_monthly_eur           numeric(10,2),
  price_annual_eur            numeric(10,2),
  max_minutes_per_month       integer,
  max_locations               integer not null default 1,
  max_concurrent_calls        integer not null default 1,
  -- Charged per sede beyond max_locations. Only Rede sells extra sedes today;
  -- null means the plan does not offer them at all.
  price_extra_location_eur    numeric(10,2),
  -- Feature flags. Keys match what check_clinic_capability() asks for, so a
  -- feature included in the plan and the same feature bought as an add-on
  -- answer the same question:
  --   whatsapp, api_integration, custom_voice, advanced_analytics,
  --   priority_support, multiple_languages, monthly_report
  features                    jsonb not null default '{}'::jsonb,
  stripe_price_id             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

drop trigger if exists trg_plans_updated on plans;
create trigger trg_plans_updated before update on plans
  for each row execute function set_updated_at();

-- Add-ons -------------------------------------------------------------------
-- An add-on unlocks exactly one feature, named in `feature_unlock`, and is only
-- offered on the plans listed in `compatible_with`. Analytics is missing 'rede'
-- because Rede already includes it: selling it there would charge twice for the
-- same thing.
create table if not exists addons (
  id               text primary key,
  name             text not null,
  description      text,
  price_monthly_eur numeric(10,2) not null,
  feature_unlock   text not null,
  compatible_with  text[] not null default array['essencial', 'clinica', 'rede'],
  stripe_price_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_addons_updated on addons;
create trigger trg_addons_updated before update on addons
  for each row execute function set_updated_at();

-- Minute packs --------------------------------------------------------------
-- A clinic that runs out of minutes mid month can either pay per loose minute
-- (`unit_price_eur`) or buy a pack. `price_per_minute_eur` is generated rather
-- than typed in so the comparison shown at checkout ("0,316 vs 0,35") can never
-- drift from the price actually charged.
--
-- minutes > 0 is not decoration: it is what keeps the generated column from
-- dividing by zero.
create table if not exists minute_packs (
  id                   text primary key,
  name                 text not null,
  minutes              integer not null check (minutes > 0),
  price_eur            numeric(10,2) not null,
  price_per_minute_eur numeric(10,4)
    generated always as (round(price_eur / minutes, 4)) stored,
  unit_price_eur       numeric(10,4) not null default 0.35,
  stripe_price_id      text,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_minute_packs_updated on minute_packs;
create trigger trg_minute_packs_updated before update on minute_packs
  for each row execute function set_updated_at();

-- The catalogue -------------------------------------------------------------
-- Seeded with `on conflict do update` so re-running this migration re-states
-- the price list instead of failing. `stripe_price_id` is deliberately left out
-- of the update: it is filled in Stripe's own time and must survive a re-run.

insert into plans (
  id, name, description,
  price_monthly_eur, price_annual_eur,
  max_minutes_per_month, max_locations, max_concurrent_calls,
  price_extra_location_eur, features
) values
  ('essencial', 'Essencial',
   'Para consultórios pequenos',
   99, 1089, 250, 1, 1, null,
   '{"whatsapp": false, "api_integration": false, "custom_voice": false, "advanced_analytics": false, "priority_support": false, "multiple_languages": false, "monthly_report": false}'::jsonb),

  ('clinica', 'Clínica',
   'Mais escolhido. Voz personalizada e reporte mensal inclusos',
   249, 2741, 750, 3, 2, null,
   '{"whatsapp": false, "api_integration": false, "custom_voice": true, "advanced_analytics": false, "priority_support": true, "multiple_languages": false, "monthly_report": true}'::jsonb),

  ('rede', 'Rede',
   'Para grupos multisede. Painel unificado, cada sede com número próprio',
   599, 6589, 2000, 3, 5, 149,
   '{"whatsapp": false, "api_integration": false, "custom_voice": true, "advanced_analytics": true, "priority_support": true, "multiple_languages": false, "monthly_report": true}'::jsonb),

  ('personalizado', 'Personalizado',
   'Para mais de 5 sedes ou mais de 2000 minutos. Sob consulta',
   null, null, null, 1, 1, null,
   '{}'::jsonb)
on conflict (id) do update set
  name                     = excluded.name,
  description              = excluded.description,
  price_monthly_eur        = excluded.price_monthly_eur,
  price_annual_eur         = excluded.price_annual_eur,
  max_minutes_per_month    = excluded.max_minutes_per_month,
  max_locations            = excluded.max_locations,
  max_concurrent_calls     = excluded.max_concurrent_calls,
  price_extra_location_eur = excluded.price_extra_location_eur,
  features                 = excluded.features,
  updated_at               = now();

insert into addons (
  id, name, description, price_monthly_eur, feature_unlock, compatible_with
) values
  ('whatsapp', 'Telma em WhatsApp',
   'Confirmações e recordatórios automáticos. Até 1000 mensagens/mês incluídas',
   49, 'whatsapp', array['essencial', 'clinica', 'rede']),

  -- Priced at 0 for now: the languages are announced before they are live, and
  -- a clinic that asks for one should not be billed for waiting.
  ('language_en', 'English',
   'A Telma responde em inglês. Em breve disponível',
   0, 'language_en', array['clinica', 'rede']),

  ('language_es', 'Español',
   'A Telma responde em espanhol. Em breve disponível',
   0, 'language_es', array['rede']),

  ('api_integration', 'API Integration',
   'Integração direta com o seu software. Orçamento à medida',
   99, 'api_integration', array['clinica', 'rede']),

  ('analytics', 'Analítica Avançada',
   'Reportes detalhados e insights (incluído em Rede)',
   49, 'advanced_analytics', array['essencial', 'clinica'])
on conflict (id) do update set
  name              = excluded.name,
  description       = excluded.description,
  price_monthly_eur = excluded.price_monthly_eur,
  feature_unlock    = excluded.feature_unlock,
  compatible_with   = excluded.compatible_with,
  updated_at        = now();

-- 250 minutes for 79 EUR is 0,316 EUR/min against 0,35 loose: roughly a tenth
-- cheaper, which is the whole argument for buying the pack.
insert into minute_packs (id, name, minutes, price_eur, unit_price_eur, active)
values
  ('pack_250', 'Pack de 250 minutos', 250, 79, 0.35, true)
on conflict (id) do update set
  name           = excluded.name,
  minutes        = excluded.minutes,
  price_eur      = excluded.price_eur,
  unit_price_eur = excluded.unit_price_eur,
  active         = excluded.active,
  updated_at     = now();

-- Row Level Security --------------------------------------------------------
-- These three tables are the public price list: every signed in user may read
-- them, nobody but the internal team may change them. Without RLS enabled
-- PostgREST would expose them for writing to any authenticated clinic user.
alter table plans        enable row level security;
alter table addons       enable row level security;
alter table minute_packs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['plans', 'addons', 'minute_packs'] loop
    execute format('drop policy if exists %1$s_select on %1$s', t);
    execute format(
      'create policy %1$s_select on %1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_internal_write on %1$s', t);
    execute format(
      'create policy %1$s_internal_write on %1$s for all using (public.is_internal()) with check (public.is_internal())',
      t);
  end loop;
end $$;
