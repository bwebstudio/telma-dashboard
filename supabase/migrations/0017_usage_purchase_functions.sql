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
