-- Telma management app: schema
-- Postgres / Supabase. Run in order: 0001, 0002, 0003.

create extension if not exists "pgcrypto";

-- Enums --------------------------------------------------------------------
do $$ begin
  create type plan_type as enum ('essencial', 'clinica', 'rede', 'personalizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type clinic_status as enum ('ativa', 'pausada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('interno', 'clinica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum ('pendente', 'confirmada', 'rejeitada', 'copiada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_origin as enum ('telefone', 'whatsapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_result as enum ('marcacao', 'transferida', 'informacao', 'nao_resolvida');
exception when duplicate_object then null; end $$;

-- Helper: keep updated_at fresh --------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Clinics ------------------------------------------------------------------
create table if not exists clinics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  phone         text,
  contact_email text,
  plan          plan_type not null default 'essencial',
  addon_whatsapp boolean not null default false,
  status        clinic_status not null default 'ativa',
  call_limit    integer not null default 250,
  -- Technical config, only visible to the internal team.
  assigned_phone text,
  voice_agent_id text,
  voice_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_clinics_updated on clinics;
create trigger trg_clinics_updated before update on clinics
  for each row execute function set_updated_at();

-- App users (mirror of auth.users) -----------------------------------------
create table if not exists users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       user_role not null default 'clinica',
  clinic_id  uuid references clinics(id) on delete set null,
  locale     text not null default 'pt',
  created_at timestamptz not null default now(),
  -- A clinic user must belong to a clinic; an internal user must not.
  constraint role_clinic_consistency check (
    (role = 'clinica' and clinic_id is not null) or
    (role = 'interno' and clinic_id is null)
  )
);
create index if not exists idx_users_clinic on users(clinic_id);

-- Availability slots -------------------------------------------------------
-- weekday follows Postgres extract(dow): 0 = Sunday ... 6 = Saturday.
-- Each row is one bookable time (start_time) with a number of seats.
create table if not exists availability_slots (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  capacity   smallint not null default 1 check (capacity > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, weekday, start_time)
);
create index if not exists idx_slots_clinic on availability_slots(clinic_id);

-- Blocked days (feriados, ferias) ------------------------------------------
create table if not exists blocked_days (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  day        date not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (clinic_id, day)
);
create index if not exists idx_blocked_clinic on blocked_days(clinic_id);

-- Calls --------------------------------------------------------------------
create table if not exists calls (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  from_phone       text,
  duration_seconds integer not null default 0,
  result           call_result,
  summary          text,
  recording_url    text,
  external_ref     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_calls_clinic_time on calls(clinic_id, created_at desc);

-- Appointments (pre-marcacoes) ---------------------------------------------
create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  call_id       uuid references calls(id) on delete set null,
  patient_name  text not null,
  patient_phone text not null,
  reason        text,
  scheduled_at  timestamptz not null,
  status        appointment_status not null default 'pendente',
  origin        appointment_origin not null default 'telefone',
  summary       text,
  reject_reason text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_appts_clinic_time on appointments(clinic_id, created_at desc);
create index if not exists idx_appts_clinic_sched on appointments(clinic_id, scheduled_at);

-- Slot locks (temporary hold during a live call) ---------------------------
create table if not exists slot_locks (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  slot_start timestamptz not null,
  call_ref   text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  unique (clinic_id, slot_start)
);
create index if not exists idx_locks_clinic on slot_locks(clinic_id);
create index if not exists idx_locks_expiry on slot_locks(expires_at);

-- Monthly usage per clinic -------------------------------------------------
create table if not exists usage (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  month       date not null,               -- first day of the month
  calls_count integer not null default 0,
  minutes     numeric(10,2) not null default 0,
  updated_at  timestamptz not null default now(),
  unique (clinic_id, month)
);
create index if not exists idx_usage_clinic on usage(clinic_id);
drop trigger if exists trg_usage_updated on usage;
create trigger trg_usage_updated before update on usage
  for each row execute function set_updated_at();

-- Activity log (recent events, for the internal team) ----------------------
create table if not exists activity_log (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid references clinics(id) on delete cascade,
  type       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_time on activity_log(created_at desc);
create index if not exists idx_activity_clinic on activity_log(clinic_id, created_at desc);
