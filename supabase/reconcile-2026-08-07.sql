-- RECONCILIACAO COMPLETA. Um unico ficheiro, uma unica colagem.
--
-- Gerado a 2026-08-07 concatenando os ficheiros de supabase/migrations pela
-- ordem em que tem de correr. Nao foi reescrito a mao: e byte a byte o que
-- esta nessa pasta, para nao haver uma segunda versao da verdade.
--
-- COMO CORRER
--   Supabase Dashboard > SQL Editor > cole tudo > Run.
--   Corre dentro de uma transacao: ou passa inteiro, ou nao muda nada.
--   Se parar, COPIE A MENSAGEM DE ERRO. E a unica coisa que diz o que falta.
--
-- O QUE FAZ
--   1. Recusa-se a correr se `purchases` ou `usage_metrics` tiverem linhas.
--   2. Larga as tabelas que tem um desenho diferente do deste repositorio:
--      plans, addons, minute_packs, purchases, usage_metrics.
--      Estavam vazias ou sao catalogo que o passo 3 volta a semear.
--   3. Recria-as e semeia o catalogo (0014).
--   4. Acrescenta as colunas em falta em clinics (0015).
--   5. Recria purchases e usage_metrics e as suas funcoes (0016, 0017).
--   6. Cria a inscricao: onboarding_sessions e as colunas do wizard (0021).
--
-- NAO TOCA em clinics (linhas), appointments, calls, availability_slots,
-- users, nem em nada crm_*. Os 648 prospetos ficam onde estao.
--
-- DEPOIS DE CORRER, verifique em /test-onboarding.

begin;



-- ============================================================
-- 0022_reconcile_divergent_schema.sql
-- ============================================================

-- Putting the database back in step with supabase/migrations.
--
-- REVIEW THIS BEFORE RUNNING IT. It drops five tables. Read the guard at the
-- top and the row counts in the comment below, and satisfy yourself that they
-- still describe your project, because they were true on 2026-08-07 and this
-- file cannot check the ones that matter most on its own.
--
-- What happened -------------------------------------------------------------
-- Migrations 0014 and 0016 were never applied. Instead, tables with the same
-- names were created directly in Supabase on 2026-08-06 with a different
-- design: `plans` keyed by `slug` with a single `price_eur`, `purchases` built
-- around a Stripe PaymentIntent, `usage_metrics` holding one row per call
-- rather than a daily total per metric. 0015 landed only in part.
--
-- Both designs are coherent. They are just not the same design, and the
-- application code reads the one in this folder: `signupPlans()` selects
-- `price_monthly_eur` and `max_minutes_per_month`, the billing screens select
-- `feature_unlock` and `final_price_eur`, and none of those columns exist. Most
-- of it fails softly, which is why this went unnoticed: `signupPlans()` catches
-- the error and falls back to the constants in lib/plans.ts, so the price list
-- renders correctly from the wrong source.
--
-- The two also disagree about the price list itself. The live tables sell
-- Essencial / Rede / Empresarial at 99 / 249 / 0; this folder and lib/plans.ts
-- sell Essencial / Clínica / Rede / Personalizado at 99 / 249 / 599 / on
-- request, which is what the landing page shows a customer. Re-seeding from
-- 0014 is therefore a correction, not just a reformat.
--
-- Why dropping rather than converging ---------------------------------------
-- Because the tables are empty or re-seedable, and converging would leave
-- permanent debris. Counts when this was written:
--
--   purchases            0 rows   financial records: none yet
--   usage_metrics        0 rows   nothing billed from it yet
--   onboarding_sessions  0 rows   handled in 0021, not here
--   plans                3 rows   catalogue, re-seeded by 0014
--   addons               4 rows   catalogue, re-seeded by 0014
--   minute_packs         4 rows   catalogue, re-seeded by 0014
--
-- Nothing a clinic or a sales rep typed is touched. `clinics`, `appointments`,
-- `calls`, `availability_slots`, `users` and every `crm_*` table (648 prospects,
-- 56 logged activities) are not mentioned below except to add columns.

-- The guard ------------------------------------------------------------------
-- The two tables that could hold money are checked rather than trusted. If
-- either has gained a row since this was written, the migration stops and says
-- so instead of destroying the first real invoice in the project.
do $$
declare n_purchases bigint; n_usage bigint;
begin
  select count(*) into n_purchases from purchases;
  select count(*) into n_usage     from usage_metrics;

  if n_purchases > 0 or n_usage > 0 then
    raise exception
      'Refusing to run: purchases has % row(s) and usage_metrics has % row(s). This migration drops both. Export them, or reconcile by hand.',
      n_purchases, n_usage;
  end if;
end $$;

-- The drops ------------------------------------------------------------------
-- `cascade` is needed, not decorative: the divergent `plans` may be referenced
-- by a foreign key from the `clinics.plan_id` column added alongside it, and
-- without cascade the drop fails on that constraint. Cascade removes the
-- constraint; it does not remove the column, which is dealt with below.
--
-- Re-running 0014 and 0016 after this recreates all five correctly. That is
-- why this file does not repeat their definitions: a second copy of a table
-- definition is a second thing to keep in step, and keeping things in step is
-- the entire problem being fixed here.
drop table if exists purchases     cascade;
drop table if exists usage_metrics cascade;
drop table if exists plans         cascade;
drop table if exists addons        cascade;
drop table if exists minute_packs  cascade;

-- Columns from the other design ----------------------------------------------
-- `clinics.plan_id` is null on every row and says the same thing as
-- `clinics.plan`, which is the enum the whole application reads. Two columns
-- for one fact is how a clinic ends up on two different plans at once, so it
-- goes. `billing_email` is likewise null everywhere and duplicated by
-- `contact_email`.
--
-- Both drops are safe because both columns are entirely null. Verify that on
-- your project before uncommenting, and if either has picked up a value since,
-- copy it across first:
--
--   select count(*) from clinics where plan_id is not null or billing_email is not null;
--
-- alter table clinics drop column if exists plan_id;
-- alter table clinics drop column if exists billing_email;

-- Left deliberately alone: `activity_log.metadata` and `crm_prospects.lon`.
-- Both are additions nothing in this folder knows about, both are harmless, and
-- neither blocks anything. Removing a column somebody may be filling is a worse
-- outcome than carrying one nobody reads.

-- After this file ------------------------------------------------------------
-- Run these, in this order. All three are idempotent (`create table if not
-- exists`, `create or replace function`, `insert ... on conflict do update`),
-- so re-running them is safe even where they had already partly landed:
--
--   0014_plans_addons_minute_packs.sql   recreates and re-seeds the catalogue
--   0015_extend_clinics.sql              adds billing_cycle, plan_renews_at,
--                                        stripe_subscription_id
--   0016_usage_metrics_purchases.sql     recreates purchases and usage_metrics
--   0017_usage_purchase_functions.sql    the functions that read them
--   0021_onboarding.sql                  the sign-up
--
-- 0021 checks for `clinics.billing_cycle` on the way in and refuses to run
-- without it, so getting the order wrong is noisy rather than silent.


-- ============================================================
-- 0014_plans_addons_minute_packs.sql
-- ============================================================

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


-- ============================================================
-- 0015_extend_clinics.sql
-- ============================================================

-- What a clinic has bought, and what it has used this month.
--
-- The plan alone stopped being enough to answer "can this clinic do X". A
-- Clínica with the WhatsApp add-on and a Clínica without it are on the same
-- plan and can do different things, so what was bought has to be stored next to
-- the clinic. `active_addons` is that list; `usage_this_month` is the running
-- counter the panel reads to draw the minutes bar without scanning every call.
--
-- Every column is added with `if not exists`, so this is safe to run again.

-- What is switched on ---------------------------------------------------------
-- Ids from the `addons` table, for example array['whatsapp', 'language_en'].
-- An array rather than a junction table because the list is short, always read
-- whole, and never joined against.
alter table clinics add column if not exists active_addons text[] not null default array[]::text[];

-- `addon_whatsapp` (0001) was the first version of this list, with room for
-- exactly one add-on. Carry its value across so no clinic loses WhatsApp on
-- deploy. The guard makes the backfill idempotent: a clinic that already has
-- the add-on listed is left alone.
--
-- The old column stays for backward compatibility with code still reading it,
-- but it is deprecated: `active_addons` is the truth from here on.
update clinics
   set active_addons = array_append(active_addons, 'whatsapp')
 where addon_whatsapp
   and not ('whatsapp' = any(active_addons));

comment on column clinics.addon_whatsapp is
  'Deprecated: superseded by active_addons. Kept for backward compatibility.';

-- What has been used ---------------------------------------------------------
-- A denormalised counter for the current cycle. `usage_metrics` (0016) keeps
-- the day by day history that invoices are built from; this is the cheap read
-- the panel and the availability check need on every request.
--
--   minutes_used            minutes inside the plan allowance
--   extra_minutes_used      minutes consumed beyond it
--   extra_minutes_purchased minutes added by minute packs, so the effective
--                           allowance is max_minutes_per_month + this
--   whatsapp_messages       against the 1000/month the add-on includes
--   api_calls               for the api_integration add-on
alter table clinics add column if not exists usage_this_month jsonb not null default '{
  "minutes_used": 0,
  "extra_minutes_used": 0,
  "extra_minutes_purchased": 0,
  "whatsapp_messages": 0,
  "api_calls": 0
}'::jsonb;

-- How it is billed -----------------------------------------------------------
-- Annual is the same plan paid once, at eleven months of the monthly price.
-- Which one a clinic is on changes what the invoice says and when it renews,
-- so it belongs on the clinic and not only in Stripe.
alter table clinics add column if not exists billing_cycle text not null default 'monthly'
  check (billing_cycle in ('monthly', 'annual'));

-- The day the allowance resets and the next charge lands. Null for clinics not
-- yet on a paid cycle (trials, manual invoicing).
alter table clinics add column if not exists plan_renews_at date;

-- Stripe ----------------------------------------------------------------------
-- Filled by the checkout flow. Null until a clinic pays through Stripe: some
-- are invoiced by bank transfer and never get an id at all.
alter table clinics add column if not exists stripe_customer_id text;
alter table clinics add column if not exists stripe_subscription_id text;

-- Indexes ---------------------------------------------------------------------
-- The three questions the internal team asks the clinic list: who is on which
-- plan, who renews soon, and who is active.
create index if not exists idx_clinics_plan on clinics(plan);
create index if not exists idx_clinics_plan_renews_at on clinics(plan_renews_at);
create index if not exists idx_clinics_status on clinics(status);

-- One customer, one subscription. A duplicate here means two clinics billed
-- against the same Stripe object, which is a support incident either way.
create unique index if not exists idx_clinics_stripe_customer
  on clinics(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_clinics_stripe_subscription
  on clinics(stripe_subscription_id) where stripe_subscription_id is not null;

-- How long a pre-marcação waits ----------------------------------------------
-- True: it holds its hour for thirty minutes and then lets it go, so Telma can
-- offer the time to the next patient who calls. False: it waits for a person,
-- however long that takes.
--
-- Which one is right is not a technical question. A clinic with somebody at the
-- desk all day wants the hour back quickly. A single-handed practice that reads
-- the panel between patients would find bookings quietly lapsing at eight in
-- the evening, and the patient who thought they had an appointment is the one
-- who pays for that. So the clinic decides, in its own screen.
--
-- The default is on, which is a change of behaviour for every clinic that
-- existed before this column: their pre-marcações used to wait indefinitely and
-- now lapse after half an hour unless somebody turns it off.
--
-- `not null` matters. A null here would read as false inside the trigger's IF,
-- so a nullable column would silently mean "no deadline" for any row that
-- missed the default, which is the opposite of what it says on the tin.
alter table clinics add column if not exists pre_appointment_auto_expires boolean not null default true;

comment on column clinics.pre_appointment_auto_expires is
  'True: a pendente pre-marcação expires after 30 minutes. False: it waits for the clinic to answer, with no deadline.';


-- ============================================================
-- 0016_usage_metrics_purchases.sql
-- ============================================================

-- The two records an invoice is built from: what was consumed, and what was paid.
--
-- `usage_this_month` on the clinic is a live counter and gets reset every cycle,
-- so it cannot answer "what did this clinic use in March". `usage_metrics` is
-- the day by day history that survives the reset, and `purchases` is every euro
-- charged, with the discount that was applied, kept for auditing.

-- Usage ----------------------------------------------------------------------
-- One row per clinic, per day, per kind of thing consumed. `count` is whatever
-- the unit of that kind is: minutes for the minute types, messages for
-- WhatsApp, requests for the API, sedes for extra_location.
--
-- `plan_id` is a snapshot, not a foreign key: an invoice for March must keep
-- saying the clinic was on Essencial that month even after it upgraded, and an
-- FK would let a plan rename rewrite history.
--
-- The unique key is what makes ingestion safe to retry. A webhook that fires
-- twice upserts the same row instead of double billing the clinic.
create table if not exists usage_metrics (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  metric_date date not null,
  metric_type text not null check (metric_type in (
    'minutes_used', 'extra_minutes_used', 'whatsapp_messages', 'api_calls', 'extra_location'
  )),
  count       integer not null default 1,
  plan_id     text,
  created_at  timestamptz not null default now(),
  unique (clinic_id, metric_date, metric_type)
);

create index if not exists idx_usage_clinic_date on usage_metrics(clinic_id, metric_date);
create index if not exists idx_usage_metric_type on usage_metrics(metric_type);
-- Billing reads a calendar month at a time, and the month is computed rather
-- than stored, so the index has to be on the expression the query uses.
create index if not exists idx_usage_clinic_month
  on usage_metrics(clinic_id, (date_trunc('month', metric_date::timestamp)));

-- Purchases -------------------------------------------------------------------
-- Every charge: an add-on switched on, a minute pack bought mid month, a plan
-- moved up or down. Prices are copied in rather than read from `plans` and
-- `addons` at invoice time, because a price change must never rewrite what
-- somebody already paid.
--
-- The discount columns exist before there is any checkout to use them. When a
-- launch coupon does happen, the record of who used it is already being kept,
-- rather than being reconstructed later from Stripe.
create table if not exists purchases (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  purchase_type    text not null check (purchase_type in (
    'addon', 'minute_pack', 'plan_upgrade', 'plan_downgrade'
  )),
  item_id          text not null,
  item_name        text not null,
  quantity         integer not null default 1 check (quantity > 0),
  unit_price_eur   numeric(10,2) not null,
  total_price_eur  numeric(10,2) not null,

  -- Discounts at checkout. `discount_eur` is the amount actually taken off;
  -- `discount_percent` records the shape of the offer ("10% off the first
  -- month") so a report can group by it.
  coupon_code      text,
  discount_eur     numeric(10,2) not null default 0,
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  -- total_price_eur - discount_eur. Never negative: a coupon worth more than
  -- the cart brings the price to zero, it does not owe the clinic money.
  final_price_eur  numeric(10,2) not null check (final_price_eur >= 0),

  payment_method   text,
  payment_status   text not null default 'pending' check (payment_status in (
    'pending', 'completed', 'failed', 'refunded'
  )),
  stripe_invoice_id text,
  stripe_charge_id  text,

  purchased_at     timestamptz not null default now(),
  -- For anything that stops being paid for on a date: an annual add-on, a pack
  -- with an expiry. Null means it does not expire.
  expires_at       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_purchases_clinic on purchases(clinic_id);
create index if not exists idx_purchases_date on purchases(purchased_at);
create index if not exists idx_purchases_type on purchases(purchase_type);
-- Partial: most purchases carry no coupon, and the question is always "who
-- redeemed this code", never "who redeemed nothing".
create index if not exists idx_purchases_coupon on purchases(coupon_code) where coupon_code is not null;
create index if not exists idx_purchases_status on purchases(payment_status);

drop trigger if exists trg_purchases_updated on purchases;
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();

-- Can this clinic do X --------------------------------------------------------
-- The one question the voice agent, the WhatsApp worker and the panel all ask,
-- answered in one place so they cannot answer it differently.
--
-- A capability is on if the clinic bought it as an add-on, or if the plan
-- already includes it. Both halves are needed: WhatsApp is only ever an add-on,
-- while custom_voice comes free with Clínica and Rede and is in nobody's
-- `active_addons`. Checking only the add-on list would tell a Clínica it cannot
-- use the voice it is already paying for.
--
-- The capability name is the key used in both places: the `feature_unlock` of
-- an add-on and the key inside `plans.features`. So the supported set is
-- whatsapp, api_integration, language_en, language_es, custom_voice, plus the
-- rest of the feature flags, and it grows by inserting a row rather than by
-- editing this function.
--
-- Anything unrecognised returns false. A typo in a caller should close the
-- door, not open it.
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
  v_from_plan     boolean;
begin
  if p_clinic_id is null or p_capability is null then
    return false;
  end if;

  select c.plan::text, coalesce(c.active_addons, array[]::text[])
    into v_plan_id, v_active_addons
    from clinics c
   where c.id = p_clinic_id;

  if not found or v_plan_id is null then
    return false;
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

-- Read only and cheap, so any signed in caller may ask. It is security definer
-- because the voice worker asks it before the clinic user has a session, and
-- all it ever discloses is a boolean about a clinic id the caller already has.
--
-- Revoked from public first: a function inherits execute for public by default,
-- and revoking from `anon` alone would leave that inherited grant in place.
revoke execute on function public.check_clinic_capability(uuid, text) from public;
grant execute on function public.check_clinic_capability(uuid, text) to authenticated, service_role;

-- Row Level Security ----------------------------------------------------------
-- Same rule as `calls` and `usage`: a clinic reads its own rows, the internal
-- team reads everything, and writes come through the service role.
alter table usage_metrics enable row level security;
alter table purchases     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['usage_metrics', 'purchases'] loop
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


-- ============================================================
-- 0017_usage_purchase_functions.sql
-- ============================================================

-- Two writes that have to be one step.
--
-- Recording usage means touching three rows (the day's history, the month's
-- meter, the clinic's live counter) and buying something means touching two
-- (the receipt, and whatever the receipt entitles the clinic to). Done from the
-- API in separate calls, a crash in the middle leaves a clinic that paid for
-- minutes it did not get, or a counter that says a call never happened.
--
-- They are also increments, and an increment cannot be expressed as a PostgREST
-- upsert: `on conflict do update` there overwrites, so two calls landing in the
-- same second would count as one.
--
-- Where each number lives, so nothing is counted twice:
--   usage.minutes                          minutes consumed this month. THE meter.
--   usage_this_month.extra_minutes_purchased  minutes bought in packs.
--   usage_this_month.whatsapp_messages/api_calls  the other live counters.
--   usage_metrics                          the day by day history invoices read.
--
-- `usage_this_month.minutes_used` is deliberately not written here. Minutes have
-- one writer, `usage`, which record_call has been keeping since 0009; the API
-- fills that key when it hands a clinic out, rather than keeping a second copy
-- that can disagree with the meter.

-- Record usage ---------------------------------------------------------------
-- Idempotent per (clinic, day, type) only in the sense that it accumulates:
-- calling it twice with 3 minutes records 6, which is what a second call
-- actually is. Callers that must not double count pass their own dedupe key
-- upstream, as the voice webhook does with `external_ref`.
create or replace function track_usage(
  p_clinic_id   uuid,
  p_metric_type text,
  p_count       integer default 1,
  p_metric_date date default current_date
) returns jsonb
language plpgsql
as $$
declare
  v_plan    text;
  v_month   date := date_trunc('month', p_metric_date)::date;
  v_total   integer;
  v_usage   jsonb;
begin
  if p_metric_type not in (
    'minutes_used', 'extra_minutes_used', 'whatsapp_messages', 'api_calls', 'extra_location'
  ) then
    raise exception 'invalid_metric_type' using errcode = 'P0001';
  end if;

  if coalesce(p_count, 0) = 0 then
    raise exception 'count_required' using errcode = 'P0001';
  end if;

  select plan::text into v_plan from clinics where id = p_clinic_id;
  if v_plan is null then
    raise exception 'clinic_not_found' using errcode = 'P0001';
  end if;

  -- The history. `count` accumulates, so the row is the day's total.
  insert into usage_metrics (clinic_id, metric_date, metric_type, count, plan_id)
  values (p_clinic_id, p_metric_date, p_metric_type, p_count, v_plan)
  on conflict (clinic_id, metric_date, metric_type) do update
    set count = usage_metrics.count + excluded.count
  returning usage_metrics.count into v_total;

  -- The meter. Both minute types feed it: minutes beyond the allowance are
  -- still minutes spoken, and what makes them "extra" is the allowance, not a
  -- different clock.
  if p_metric_type in ('minutes_used', 'extra_minutes_used') then
    insert into usage (clinic_id, month, calls_count, minutes)
    values (p_clinic_id, v_month, 0, p_count)
    on conflict (clinic_id, month) do update
      set minutes = usage.minutes + excluded.minutes;
  end if;

  -- The live counters the panel reads without touching history.
  if p_metric_type in ('whatsapp_messages', 'api_calls') then
    update clinics
       set usage_this_month = jsonb_set(
             coalesce(usage_this_month, '{}'::jsonb),
             array[p_metric_type],
             to_jsonb(coalesce((usage_this_month ->> p_metric_type)::numeric, 0) + p_count)
           )
     where id = p_clinic_id
     returning usage_this_month into v_usage;
  else
    select usage_this_month into v_usage from clinics where id = p_clinic_id;
  end if;

  return jsonb_build_object(
    'metric_type', p_metric_type,
    'metric_date', p_metric_date,
    'day_total', v_total,
    'usage_this_month', coalesce(v_usage, '{}'::jsonb)
  );
end $$;

-- Record a purchase ----------------------------------------------------------
-- Writes the receipt and, in the same transaction, whatever the receipt buys:
-- minutes added to the allowance, an add-on switched on, a plan moved.
--
-- Entitlements are granted only when the money is in ('completed'). Once Stripe
-- is wired the endpoint will insert 'pending' and the webhook will call this
-- again with 'completed'; until then the internal team records what was already
-- agreed, and the grant happens on the spot.
create or replace function apply_purchase(
  p_clinic_id        uuid,
  p_purchase_type    text,
  p_item_id          text,
  p_item_name        text,
  p_quantity         integer,
  p_unit_price_eur   numeric,
  p_total_price_eur  numeric,
  p_coupon_code      text,
  p_discount_eur     numeric,
  p_discount_percent integer,
  p_final_price_eur  numeric,
  p_payment_method   text,
  p_payment_status   text,
  -- Minutes one unit of the item grants. Non-zero only for minute packs; passed
  -- in rather than looked up so a pack's price list can change without changing
  -- what an already agreed purchase grants.
  p_minutes_per_unit integer default 0
) returns purchases
language plpgsql
as $$
declare
  v_row     purchases;
  v_minutes integer;
  v_limit   integer;
begin
  if not exists (select 1 from clinics where id = p_clinic_id) then
    raise exception 'clinic_not_found' using errcode = 'P0001';
  end if;

  insert into purchases (
    clinic_id, purchase_type, item_id, item_name, quantity,
    unit_price_eur, total_price_eur,
    coupon_code, discount_eur, discount_percent, final_price_eur,
    payment_method, payment_status
  ) values (
    p_clinic_id, p_purchase_type, p_item_id, p_item_name, greatest(coalesce(p_quantity, 1), 1),
    p_unit_price_eur, p_total_price_eur,
    p_coupon_code, coalesce(p_discount_eur, 0), coalesce(p_discount_percent, 0), p_final_price_eur,
    p_payment_method, coalesce(p_payment_status, 'pending')
  ) returning * into v_row;

  if v_row.payment_status <> 'completed' then
    return v_row;
  end if;

  -- Minutes bought raise the allowance for the rest of the cycle.
  if p_purchase_type = 'minute_pack' and coalesce(p_minutes_per_unit, 0) > 0 then
    v_minutes := p_minutes_per_unit * v_row.quantity;
    update clinics
       set usage_this_month = jsonb_set(
             coalesce(usage_this_month, '{}'::jsonb),
             array['extra_minutes_purchased'],
             to_jsonb(coalesce((usage_this_month ->> 'extra_minutes_purchased')::numeric, 0) + v_minutes)
           )
     where id = p_clinic_id;

    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'minutes_purchased',
      'A clinica comprou ' || v_minutes || ' minutos extra');
  end if;

  -- An add-on switched on. `array_append` guarded by the membership test, so
  -- buying the same add-on twice does not list it twice.
  if p_purchase_type = 'addon' then
    update clinics
       set active_addons = case
             when p_item_id = any(coalesce(active_addons, array[]::text[])) then active_addons
             else array_append(coalesce(active_addons, array[]::text[]), p_item_id)
           end,
           -- Kept in step for the code still reading the old boolean.
           addon_whatsapp = addon_whatsapp or p_item_id = 'whatsapp'
     where id = p_clinic_id;

    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'addon_activated', 'Add-on activado: ' || p_item_name);
  end if;

  -- A plan change. `minute_limit` follows the new plan, so the limit the panel
  -- enforces and the plan the clinic pays for cannot disagree.
  if p_purchase_type in ('plan_upgrade', 'plan_downgrade') then
    if not exists (select 1 from plans where id = p_item_id) then
      raise exception 'unknown_plan' using errcode = 'P0001';
    end if;
    select max_minutes_per_month into v_limit from plans where id = p_item_id;

    -- A plan with no allowance of its own is 'personalizado', whose number was
    -- negotiated and lives on the clinic. Moving onto it must not wipe it.
    update clinics
       set plan = p_item_id::plan_type,
           minute_limit = coalesce(v_limit, minute_limit)
     where id = p_clinic_id;

    insert into activity_log (clinic_id, type, message)
    values (p_clinic_id, 'plan_changed', 'Plano alterado para ' || p_item_name);
  end if;

  return v_row;
end $$;

-- Service role only, like every other function the voice API calls. The revoke
-- has to name `public`, because that is where the default execute grant lives;
-- the grant then has to name `service_role`, which was reaching these through
-- that same default and would otherwise lose them.
revoke execute on function track_usage(uuid, text, integer, date) from public;
grant  execute on function track_usage(uuid, text, integer, date) to service_role;

revoke execute on function apply_purchase(
  uuid, text, text, text, integer, numeric, numeric, text, numeric, integer, numeric, text, text, integer
) from public;
grant execute on function apply_purchase(
  uuid, text, text, text, integer, numeric, numeric, text, numeric, integer, numeric, text, text, integer
) to service_role;


-- ============================================================
-- 0021_onboarding.sql
-- ============================================================

-- A clinic signs itself up.
--
-- Until now a clinic existed because somebody on the internal team typed it
-- into /clinicas/nova. That is the right shape for the first client and the
-- wrong shape for the tenth: it puts a person in the middle of every sale, and
-- it means the clinic never states its own hours, services or voice. Those
-- answers then have to be collected over the phone and typed in a second time.
--
-- Two things are added here. Somewhere to keep a half-finished sign-up, and the
-- columns the wizard asks about that the clinic record had no room for.

-- Precondition ----------------------------------------------------------------
-- The sign-up writes `clinics.billing_cycle`, which 0015 adds. This checks for
-- it rather than adding it, because repeating a column definition in a second
-- migration is how two migrations end up disagreeing about the same column.
--
-- It is a check and not an assumption because at least one project was found
-- with 0015 only partly applied: `active_addons` and `usage_this_month` present,
-- `billing_cycle` absent. Without this the migration succeeds, and the failure
-- surfaces later as a clinic that cannot be created halfway through a sign-up.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'clinics'
       and column_name = 'billing_cycle'
  ) then
    raise exception
      'clinics.billing_cycle is missing: run 0015_extend_clinics.sql before this migration. It is idempotent, so re-running it is safe.';
  end if;
end $$;

-- The half-finished sign-up --------------------------------------------------
-- A form that takes six steps will be abandoned in the middle, and the person
-- who comes back an hour later on their phone is the same customer. The draft
-- is keyed by an opaque token the browser keeps, not by a user: nobody has an
-- account yet, which is the whole point of the flow.
--
-- `data` holds the validated payload of every step completed so far, merged
-- into one object. Deliberately one jsonb rather than six columns: the shape
-- belongs to the zod schemas in lib/onboarding/wizard-schema.ts, and repeating
-- it here would mean editing two places every time a question changes.
--
-- The drop is deliberate, and it is not a `create if not exists`.
--
-- A table of this name already existed on the live project, from an earlier and
-- abandoned attempt at this flow: keyed by `email` (not null, no default), with
-- a `stripe_payment_intent_id`, an `id` with no default, and timestamps without
-- a zone. `create table if not exists` is silent in the face of that. It does
-- nothing, and the app then fails on every save with "could not find the
-- 'token' column" no matter how many times the migration is re-run.
--
-- Adding the missing columns on top was the other option and it is worse: the
-- inserts would still fail on `email`, and what survived would carry two dead
-- columns and the wrong timestamp type forever.
--
-- Checked before writing this: the table held zero rows, and nothing in the
-- codebase referenced it or `stripe_payment_intent_id`. If either of those is
-- not true on your project, stop and read the table before running this.
drop table if exists onboarding_sessions;

create table onboarding_sessions (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  data         jsonb not null default '{}'::jsonb,
  -- The furthest step completed. 0 means the applicant has answered nothing.
  current_step smallint not null default 0 check (current_step between 0 and 6),
  -- Filled when the sign-up went through, pointing at what it produced. A
  -- completed row is kept rather than deleted: it is the record of what was
  -- agreed, and the only place the answers exist in the shape they were given.
  clinic_id    uuid references clinics(id) on delete set null,
  completed_at timestamptz,
  -- An abandoned draft is somebody's name, email and phone number that nobody
  -- asked us to keep. Anything past this date is safe to delete; the sweep is
  -- at the bottom of this file, as a function rather than a schedule, so the
  -- decision of when to run it stays outside the migration.
  expires_at   timestamptz not null default now() + interval '30 days',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_onboarding_sessions_expires
  on onboarding_sessions(expires_at) where completed_at is null;
create index if not exists idx_onboarding_sessions_clinic
  on onboarding_sessions(clinic_id);

drop trigger if exists trg_onboarding_sessions_updated on onboarding_sessions;
create trigger trg_onboarding_sessions_updated before update on onboarding_sessions
  for each row execute function set_updated_at();

-- Row Level Security ---------------------------------------------------------
-- Enabled with no policy at all, which is not an oversight. A draft holds a
-- clinic's contact details before anyone has authenticated, so neither `anon`
-- nor `authenticated` may touch it through PostgREST. Everything that reads or
-- writes this table goes through the server actions, which use the service
-- role and bypass RLS. Without this line PostgREST would happily serve every
-- applicant's email to anyone with the anon key.
alter table onboarding_sessions enable row level security;

-- Internal staff can look at drafts from the panel: a sign-up that stalls at
-- step four is a sales lead, and somebody has to be able to see it.
drop policy if exists onboarding_sessions_internal on onboarding_sessions;
create policy onboarding_sessions_internal on onboarding_sessions
  for select using (public.is_internal());

-- What the clinic told us about itself ---------------------------------------
-- These used to live in a phone call. `specialty` and `region` steer the voice
-- agent's script and the number we buy; `services` is the list Telma is allowed
-- to book, and answering "do you do implants" wrongly is worse than not
-- answering at all.
alter table clinics add column if not exists specialty text;
alter table clinics add column if not exists region text;
alter table clinics add column if not exists services text[] not null default array[]::text[];

-- How the diary is cut up. The wizard asks for both because they are different
-- questions: the appointment is how long the patient is in the chair, the
-- interval is how often a new one may start. A clinic with 45 minute
-- appointments starting every 30 minutes is running two chairs, and the slot
-- generator has to be told that rather than guess it.
alter table clinics add column if not exists appointment_duration_minutes smallint not null default 30
  check (appointment_duration_minutes between 5 and 240);
alter table clinics add column if not exists min_interval_minutes smallint not null default 30
  check (min_interval_minutes between 5 and 240);

-- Where the phone number came from. 'provisioned' is a number we bought and
-- own; 'ported' is the clinic's own number, still with their operator, pointed
-- at us over SIP. The difference decides who to call when calls stop arriving,
-- so it is worth a column rather than being inferred from whether
-- `phone_provider_ref` is null.
alter table clinics add column if not exists phone_source text
  check (phone_source is null or phone_source in ('provisioned', 'ported'));

-- The operator's identifier for the number: a Twilio SID for a provisioned
-- number, or nothing at all for a ported one, whose details live in
-- `porting_details` ({"current_number": "+3512...", "operator": "MEO"}).
alter table clinics add column if not exists phone_provider_ref text;
alter table clinics add column if not exists porting_details jsonb;

-- When the clinic finished signing itself up. Null for every clinic created by
-- the internal team, which is the honest answer: they never went through it.
alter table clinics add column if not exists onboarding_completed_at timestamptz;

-- Housekeeping ---------------------------------------------------------------
-- Deletes abandoned drafts that are past their date. Completed sign-ups are
-- never touched, however old. Call it from a cron job, from the panel, or by
-- hand; this migration only makes it possible, it does not schedule it, because
-- how often to forget somebody is a policy question and not a schema one.
create or replace function purge_expired_onboarding_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from onboarding_sessions
   where completed_at is null
     and expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function purge_expired_onboarding_sessions() from public;


commit;
