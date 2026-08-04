-- What the clinic panel needs to be worth opening.
--
-- Three things: conversations that are not only phone calls, cancellations
-- that can be told apart from refusals, and a clinic that looks like itself.

-- Conversations -------------------------------------------------------------
-- A phone call and a WhatsApp thread are the same event to a receptionist:
-- somebody contacted the clinic, Telma answered, something came of it. They
-- live in the same table so the day reads as one timeline instead of two lists
-- that have to be merged in the reader's head.
--
-- Minutes are metered from `usage`, which the webhooks write; adding WhatsApp
-- rows here does not touch what a clinic is billed for.
do $$ begin
  create type conversation_channel as enum ('telefone', 'whatsapp');
exception when duplicate_object then null; end $$;

alter table calls add column if not exists channel conversation_channel not null default 'telefone';
alter table calls add column if not exists patient_name text;

-- The turns of the conversation, oldest first:
--   [{"speaker": "telma" | "paciente", "text": "...", "at": "2026-08-04T09:12:04Z"}]
--
-- For a call this is the transcription; for WhatsApp it is the messages
-- themselves. Same shape either way, so one component reads both. Nullable:
-- an older call has no transcript and that is not an error.
alter table calls add column if not exists transcript jsonb;

create index if not exists idx_calls_clinic_channel on calls(clinic_id, channel, created_at desc);

-- Cancellations -------------------------------------------------------------
-- Who called it off matters. A patient cancelling frees a slot the clinic can
-- offer again; the clinic cancelling is its own decision and needs no alert.
alter table appointments add column if not exists cancelled_at timestamptz;
alter table appointments add column if not exists cancelled_by text
  check (cancelled_by is null or cancelled_by in ('paciente', 'clinica'));
alter table appointments add column if not exists cancel_reason text;

-- "What changed since I last looked" is the first question of the day, and the
-- agenda asks it on every load.
create index if not exists idx_appts_clinic_decided on appointments(clinic_id, decided_at desc);

-- The clinic's own hours -----------------------------------------------------
-- Vercel runs in UTC. An agenda that draws its day boundary in UTC shows a
-- Lisbon clinic yesterday's 23:30 booking under "today" for an hour every
-- night, and in Madrid it is wrong by an hour all year. The clinic's own zone
-- is the only correct answer, so it is stored next to the clinic.
alter table clinics add column if not exists timezone text not null default 'Europe/Lisbon';

-- The clinic's own face ------------------------------------------------------
-- Minimal on purpose. A logo and one accent is enough for a clinic to feel the
-- panel is theirs; a free colour picker is enough to produce grey-on-grey text
-- and a support call. The accent is a name, and the app maps names to values
-- that have been checked for contrast.
alter table clinics add column if not exists logo_url text;
alter table clinics add column if not exists accent text not null default 'brand'
  check (accent in ('brand', 'ocean', 'plum', 'clay', 'slate'));

-- Logo storage ---------------------------------------------------------------
-- Public bucket: a logo is on the clinic's own website already, and a signed
-- URL that expires would leave the panel with a broken image.
insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do nothing;

-- A clinic writes only inside a folder named after its own clinic_id, so one
-- clinic can never overwrite another's logo.
drop policy if exists clinic_logos_read on storage.objects;
create policy clinic_logos_read on storage.objects for select
  using (bucket_id = 'clinic-logos');

drop policy if exists clinic_logos_write on storage.objects;
create policy clinic_logos_write on storage.objects for all
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and (public.is_internal() or (storage.foldername(name))[1] = public.current_clinic_id()::text)
  )
  with check (
    bucket_id = 'clinic-logos'
    and (public.is_internal() or (storage.foldername(name))[1] = public.current_clinic_id()::text)
  );
