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

-- Is there anything to reconcile? -------------------------------------------
-- This file is a one-shot repair, not a migration that can be replayed, and
-- that distinction cost a live database once already: run in numeric order
-- after the repair had been done, it dropped the catalogue a second time and
-- the migration after it failed with `relation "plans" does not exist`.
--
-- So it now asks first. Reconciliation is needed only while the divergent shape
-- is still there: a `plans` without `price_monthly_eur`, a `purchases` without
-- `final_price_eur`, a `usage_metrics` without `metric_type`. Once 0014 and
-- 0016 have recreated them properly, every check below is false and this file
-- does nothing at all, however many times it runs.
do $$
declare
  v_needed      boolean := false;
  v_purchases   bigint  := 0;
  v_usage       bigint  := 0;
begin
  -- `to_regclass` returns null for a table that does not exist, which is how
  -- these checks stay safe on a database where the table was already dropped.
  if to_regclass('public.plans') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='plans'
                        and column_name='price_monthly_eur') then
    v_needed := true;
  end if;

  if to_regclass('public.purchases') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='purchases'
                        and column_name='final_price_eur') then
    v_needed := true;
  end if;

  if to_regclass('public.usage_metrics') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='usage_metrics'
                        and column_name='metric_type') then
    v_needed := true;
  end if;

  if not v_needed then
    raise notice 'Nothing to reconcile: the catalogue tables are already in the shape this repo expects. Skipping.';
    return;
  end if;

  -- The two tables that could hold money are checked rather than trusted. If
  -- either has gained a row since this was written, the migration stops and
  -- says so instead of destroying the first real invoice in the project.
  if to_regclass('public.purchases') is not null then
    execute 'select count(*) from purchases' into v_purchases;
  end if;
  if to_regclass('public.usage_metrics') is not null then
    execute 'select count(*) from usage_metrics' into v_usage;
  end if;

  if v_purchases > 0 or v_usage > 0 then
    raise exception
      'Refusing to run: purchases has % row(s) and usage_metrics has % row(s). This migration drops both. Export them, or reconcile by hand.',
      v_purchases, v_usage;
  end if;

  -- The drops -----------------------------------------------------------------
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

  raise notice 'Catalogue tables dropped. Now run 0014, 0015, 0016 and 0017 to recreate them.';
end $$;

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
