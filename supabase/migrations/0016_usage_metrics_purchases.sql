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
