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
