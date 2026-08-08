-- RECUPERACAO. Um unico ficheiro, uma unica colagem.
--
-- A 0022 e uma reparacao de uso unico, nao uma migracao que se possa repetir.
-- Corrida em ordem numerica depois de a reparacao ja ter sido feita, largou as
-- tabelas de catalogo uma segunda vez, e a 0025 foi encontrar `plans` ausente.
-- (A 0022 ja foi corrigida: agora verifica primeiro e nao faz nada se ja
-- estiver reconciliado. Este ficheiro repoe o que a corrida anterior levou.)
--
-- Estado verificado a 2026-08-07, antes de gerar isto:
--   AUSENTE  plans, addons, minute_packs, purchases, usage_metrics
--   INTACTO  clinics, appointments, calls, users, crm_* (648 prospetos)
--   APLICADO 0021, 0023, 0024
--   POR CORRER 0025, 0026, 0027
--
-- purchases e usage_metrics estavam vazias, portanto nao se perdeu nenhum
-- registo financeiro. plans, addons e minute_packs sao catalogo, e a 0014
-- volta a semea-lo.
--
-- COMO CORRER
--   Supabase Dashboard > SQL Editor > cole tudo > Run.
--   Corre dentro de uma transacao: ou passa inteiro, ou nao muda nada.
--   Se parar, COPIE A MENSAGEM DE ERRO.
--
-- NAO INCLUI a 0022. De proposito.

begin;



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
-- 0025_flexible_languages.sql
-- ============================================================

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


-- ============================================================
-- 0026_receptionist_briefing.sql
-- ============================================================

-- Training the receptionist.
--
-- Everything Telma needs to know about a clinic that is not a schedule and not
-- a service list. Until now the sign-up collected what the diary needed and
-- nothing about how to behave on the phone, so the agent had a calendar and no
-- manners: it could book an hour but could not say where the clinic is, whether
-- to address somebody formally, what a cleaning costs, or what to do when it
-- cannot help.
--
-- These columns are the variables half of the prompt. The other half — the
-- personality, the courtesies, the shape of a conversation — is ours and lives
-- in lib/onboarding/prompt.ts, versioned with the application. A clinic fills
-- in the variables; it does not write the character.

-- Where it is ------------------------------------------------------------------
-- `address` already exists from 0001 and was never asked for by the sign-up.
-- It is the single most common question a receptionist answers and the wizard
-- was not collecting it.

-- What things cost -------------------------------------------------------------
-- Optional and free text, deliberately. Some clinics quote prices on the phone
-- and some refuse on principle, and the ones that do quote have a structure
-- nobody else's fits: per treatment, from-prices, first consultation free.
-- Trying to model that as rows would produce a form nobody finishes, and the
-- agent reads it as prose either way. Null means "do not discuss prices", which
-- is a different instruction from an empty string and the prompt says so.
alter table clinics add column if not exists price_info text;

comment on column clinics.price_info is
  'What the clinic is willing to say about prices, in its own words. Null means Telma does not discuss prices at all.';

-- How to speak to people --------------------------------------------------------
-- 'formal' is usted / o senhor, 'informal' is tú / você. Not a stylistic
-- preference: a dental clinic in Porto and an aesthetic clinic in Barcelona
-- differ on this, and getting it wrong is the first thing a patient notices.
alter table clinics add column if not exists formality text not null default 'formal'
  check (formality in ('formal', 'informal'));

-- What to do when Telma cannot help ---------------------------------------------
-- Three honest options, and the clinic picks one. 'transfer' needs a number to
-- transfer to; the others need nothing.
alter table clinics add column if not exists fallback_policy text not null default 'message'
  check (fallback_policy in ('transfer', 'message', 'callback'));
alter table clinics add column if not exists fallback_number text;

comment on column clinics.fallback_policy is
  'transfer: put the caller through to fallback_number. message: take a message. callback: promise somebody will ring back.';

-- Anything else -----------------------------------------------------------------
-- The free text field that catches what no form anticipated: parking, which
-- insurers are accepted, the entrance being round the back, the fact that the
-- dentist is away on Thursdays. Read into the prompt verbatim.
alter table clinics add column if not exists briefing text;

comment on column clinics.briefing is
  'Free text from the sign-up: anything the clinic wants Telma to know that no other field covers. Goes into the prompt as written.';

-- The base language stops being compulsory ---------------------------------------
-- 0025 forced every clinic to keep the language of its country, on the grounds
-- that a clinic should always speak the local language. That is an assumption,
-- and it is the clinic's to make: an international practice in Lisbon whose
-- patients are British does not want Portuguese taking one of its two slots.
--
-- What survives is the part that is actually a rule: at least one language, all
-- of them real, no more than the plan includes.
create or replace function public.validate_clinic_languages()
returns trigger language plpgsql as $$
declare
  v_max     smallint;
  v_unknown text;
begin
  if new.selected_languages is null or cardinality(new.selected_languages) = 0 then
    raise exception 'A clinic must speak at least one language'
      using errcode = 'check_violation';
  end if;

  select code into v_unknown
    from unnest(new.selected_languages) as code
   where code not in (select l.code from available_languages l where l.status = 'available')
   limit 1;

  if v_unknown is not null then
    raise exception 'Language "%" is not available', v_unknown
      using errcode = 'check_violation';
  end if;

  select p.max_languages_included into v_max
    from plans p where p.id = new.plan::text;

  if v_max is not null and cardinality(new.selected_languages) > v_max then
    raise exception 'Plan % includes % language(s); % were selected',
      new.plan, v_max, cardinality(new.selected_languages)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- `clinics.language` was the base language, and there is no base language any
-- more. It stays as the one Telma opens in when a caller has not said anything
-- yet, which is a real thing an agent needs and a much smaller claim.
comment on column clinics.language is
  'The language Telma greets in, before the caller has said anything. Must be one of selected_languages.';


-- ============================================================
-- 0027_emergency_protocol.sql
-- ============================================================

-- What Telma does when somebody is in pain.
--
-- The landing promises it in writing: "em urgência, ou se o paciente pedir, a
-- Telma passa a chamada para uma pessoa real". Nothing in the schema carried
-- that, so nothing in the prompt could say it.
--
-- It is not `fallback_policy` under another name. That one covers "I do not
-- know the answer" and its right instinct is to take a message. This covers
-- somebody bleeding after an extraction, and its right instinct is to interrupt
-- whatever else is happening and reach a person. Taking a message from the
-- first is service; taking a message from the second is negligence.

-- Where an emergency goes -------------------------------------------------------
-- Nullable, and the prompt handles null rather than inventing a number: a clinic
-- that never named one gets an instruction to send the caller to an emergency
-- service, which is worse than a direct line and much better than a guess.
alter table clinics add column if not exists emergency_number text;

comment on column clinics.emergency_number is
  'Where Telma escalates an emergency. Inside opening hours she transfers to it; outside, she reads it out as the number to ring now.';

-- What the clinic wants said ----------------------------------------------------
-- Free text, because the answer differs for a dental practice, an aesthetic
-- clinic and a veterinary hospital, and because the out-of-hours instruction is
-- exactly the kind of thing specific to one clinic's arrangement with one
-- on-call service.
alter table clinics add column if not exists emergency_protocol text;

comment on column clinics.emergency_protocol is
  'The clinic''s own words for what to do in an emergency. Read into the prompt verbatim, under the rules, never over them.';

-- Whether the call is recorded --------------------------------------------------
-- True for every clinic today, because the panel stores the audio of every call
-- and plays it back in the conversations screen. A column and not a constant so
-- a clinic that opts out can, and so the prompt's opening line is driven by what
-- is true rather than by an assumption.
--
-- The default is the important part. Recording a call in the EU without telling
-- the other party is a GDPR problem, and the product sells "RGPD e dados
-- alojados na UE" as an argument, so the notice is on unless somebody
-- deliberately turns the recording off.
alter table clinics add column if not exists calls_recorded boolean not null default true;

comment on column clinics.calls_recorded is
  'Whether call audio is stored. When true, Telma announces the recording in her opening line, which is what makes it lawful.';


commit;
