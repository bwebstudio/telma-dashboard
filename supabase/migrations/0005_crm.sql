-- CRM comercial (funil de vendas).
--
-- IMPORTANT: a "prospect" is NOT a client. The operational tables (clinics,
-- appointments, calls, usage) describe clinics that already pay for Telma.
-- Everything in this file lives under the crm_ prefix and describes clinics
-- the sales team is still trying to win. The two never mix in a query.
--
-- Enum values are stored as neutral English keys. The visible label is
-- translated per user language in the app, so the same row reads
-- "Nao atende" for a Portuguese rep and "No contesta" for a Spanish one.

-- Enums --------------------------------------------------------------------
do $$ begin
  create type crm_country as enum ('PT', 'ES');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_rep_role as enum ('admin', 'comercial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_specialty as enum ('dental', 'aesthetic', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_origin as enum ('cold', 'referral');
exception when duplicate_object then null; end $$;

-- Sales stage. Never set by hand: recalculated from the last activity.
do $$ begin
  create type crm_stage as enum (
    'new', 'attempting', 'contacted', 'interested', 'meeting', 'won', 'lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_activity_type as enum ('call', 'whatsapp', 'email', 'visit', 'note');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_result as enum (
    'no_answer', 'busy', 'lunch_break', 'on_holiday', 'reception_no_dm',
    'spoke_dm', 'interested', 'meeting_set', 'won', 'lost', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_contact_role as enum ('doctor', 'reception', 'other');
exception when duplicate_object then null; end $$;

-- Users: allow the new internal role ----------------------------------------
-- A clinic user belongs to a clinic; every internal role (interno, comercial)
-- must not. Written without naming the new enum value so it stays portable.
alter table users drop constraint if exists role_clinic_consistency;
alter table users add constraint role_clinic_consistency check (
  (role = 'clinica' and clinic_id is not null) or
  (role <> 'clinica' and clinic_id is null)
);

-- Reps ----------------------------------------------------------------------
-- One row per member of the sales team, keyed by the existing auth user.
-- No separate login system: this is the same Supabase Auth account.
create table if not exists crm_reps (
  id         uuid primary key references users(id) on delete cascade,
  full_name  text not null,
  email      text,
  country    crm_country not null default 'PT',
  territory  text,
  role       crm_rep_role not null default 'comercial',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_reps_active on crm_reps(active, country);

-- Prospects -----------------------------------------------------------------
create table if not exists crm_prospects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  specialty     crm_specialty not null default 'other',
  country       crm_country not null default 'PT',
  zone          text,
  address       text,
  phone         text,
  -- Digits only, kept in sync by Postgres. Used for duplicate detection so
  -- "+351 912 345 678" and "912345678" collide.
  phone_digits  text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  website       text,
  origin        crm_origin not null default 'cold',
  origin_note   text,
  rep_id        uuid references crm_reps(id) on delete set null,
  stage         crm_stage not null default 'new',
  next_action_text text,
  next_action_at   timestamptz,
  last_activity_at timestamptz,
  -- Conversion to a real client. Never automatic: a rep can request it, an
  -- internal admin completes the alta with plan, schedule and phone number.
  conversion_requested_at timestamptz,
  converted_clinic_id uuid references clinics(id) on delete set null,
  converted_at  timestamptz,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- "What do I have to do today" is the most frequent query of the whole app.
create index if not exists idx_crm_prospects_rep_next on crm_prospects(rep_id, next_action_at);
create index if not exists idx_crm_prospects_next on crm_prospects(next_action_at);
create index if not exists idx_crm_prospects_country on crm_prospects(country, rep_id);
create index if not exists idx_crm_prospects_stage on crm_prospects(stage);
create index if not exists idx_crm_prospects_name on crm_prospects(lower(name));
create index if not exists idx_crm_prospects_phone on crm_prospects(phone_digits);

drop trigger if exists trg_crm_prospects_updated on crm_prospects;
create trigger trg_crm_prospects_updated before update on crm_prospects
  for each row execute function set_updated_at();

-- Contacts inside a prospect (the doctor, the receptionist) -----------------
create table if not exists crm_contacts (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references crm_prospects(id) on delete cascade,
  name        text not null,
  role        crm_contact_role not null default 'other',
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_crm_contacts_prospect on crm_contacts(prospect_id);

-- Activities: the heart of the app -----------------------------------------
-- One row per interaction, exactly as the rep types it on the street.
-- note is free text and is never translated or rewritten.
create table if not exists crm_activities (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references crm_prospects(id) on delete cascade,
  rep_id      uuid references crm_reps(id) on delete set null,
  type        crm_activity_type not null default 'call',
  result      crm_result,
  note        text,
  next_action_at   timestamptz,
  next_action_text text,
  -- Idempotency key generated on the phone. The offline queue may retry the
  -- same activity several times over a bad connection; the unique index makes
  -- those retries harmless.
  client_ref  text unique,
  created_at  timestamptz not null default now()
);
create index if not exists idx_crm_activities_prospect on crm_activities(prospect_id, created_at desc);
create index if not exists idx_crm_activities_rep on crm_activities(rep_id, created_at desc);

-- Stage derived from the last activity --------------------------------------
create or replace function crm_stage_from_result(p_result crm_result)
returns crm_stage language sql immutable as $$
  select case p_result
    when 'won'             then 'won'::crm_stage
    when 'lost'            then 'lost'::crm_stage
    when 'meeting_set'     then 'meeting'::crm_stage
    when 'interested'      then 'interested'::crm_stage
    when 'spoke_dm'        then 'contacted'::crm_stage
    when 'reception_no_dm' then 'attempting'::crm_stage
    when 'no_answer'       then 'attempting'::crm_stage
    when 'busy'            then 'attempting'::crm_stage
    when 'lunch_break'     then 'attempting'::crm_stage
    when 'on_holiday'      then 'attempting'::crm_stage
    else null
  end;
$$;

-- Keeps the prospect header in sync so the rep never has to type the same
-- thing twice. Older activities arriving late (offline queue flushing after
-- a newer one was already saved) are stored but do not move the stage back.
create or replace function crm_apply_activity()
returns trigger language plpgsql as $$
declare
  v_stage crm_stage := crm_stage_from_result(new.result);
  v_closed boolean := v_stage in ('won', 'lost');
begin
  update crm_prospects p set
    stage = coalesce(v_stage, p.stage),
    next_action_at = case
      when new.next_action_at is not null then new.next_action_at
      when v_closed then null
      else p.next_action_at end,
    next_action_text = case
      when new.next_action_at is not null then new.next_action_text
      when v_closed then null
      else p.next_action_text end,
    last_activity_at = new.created_at
  where p.id = new.prospect_id
    and (p.last_activity_at is null or new.created_at >= p.last_activity_at);

  return new;
end $$;

drop trigger if exists trg_crm_activity_applied on crm_activities;
create trigger trg_crm_activity_applied after insert on crm_activities
  for each row execute function crm_apply_activity();

-- Realtime ------------------------------------------------------------------
-- So HOJE and the activity thread update without a reload when the admin
-- reassigns a clinic or another rep logs a call.
do $$ begin
  alter publication supabase_realtime add table crm_prospects;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table crm_activities;
exception when duplicate_object then null; end $$;
