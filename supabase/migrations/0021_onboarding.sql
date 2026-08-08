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
