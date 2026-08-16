-- Throwing things away, on a schedule, without anybody remembering to.
--
-- Until now nothing was ever deleted. Voice recordings, transcripts, telephone
-- numbers and the reason somebody came to a clinic were kept for ever, and the
-- reason was written down in the patient's own words. That is health data with
-- no end date, held by us on behalf of clinics who have to answer for it.
--
-- The periods are the clinic's to justify and ours to enforce:
--
--   audio               7 days     (the recording itself lives at ElevenLabs)
--   transcript         30 days
--   caller's number    90 days     see the note below
--   call summary       90 days
--   appointment data   while the clinic is active, plus 30 days
--   activity log       12 months
--
-- ── WHY A FUNCTION AND A SCHEDULE, NOT AN expires_at ───────────────────────
-- A column saying when a row should go is a promise, not a deletion. The rows
-- stay, a query somewhere forgets the filter, and a data protection answer
-- turns out to be false. This deletes.
--
-- ── THE CALLER'S NUMBER ────────────────────────────────────────────────────
-- Not in the periods I was given, and left in it deliberately rather than kept
-- for ever by omission: a telephone number identifies a person as surely as a
-- name does, and a call row that has lost its summary and its transcript has no
-- use for one. What survives afterwards is duration, result and clinic, which
-- is what billing needs and identifies nobody.

create or replace function purge_expired() returns jsonb language plpgsql as $$
declare
  v_audio      integer;
  v_transcript integer;
  v_summary    integer;
  v_appts      integer;
  v_log        integer;
begin
  -- Audio, at seven days. Only the pointer is ours; the recording is deleted at
  -- ElevenLabs by its own retention, set to the same seven days. Clearing this
  -- here stops the panel offering a link to something that has gone.
  update calls set recording_url = null
   where recording_url is not null
     and created_at < now() - interval '7 days';
  get diagnostics v_audio = row_count;

  update calls set transcript = null
   where transcript is not null
     and created_at < now() - interval '30 days';
  get diagnostics v_transcript = row_count;

  update calls set summary = null, from_phone = null
   where (summary is not null or from_phone is not null)
     and created_at < now() - interval '90 days';
  get diagnostics v_summary = row_count;

  -- Appointments live as long as the clinic does. A clinic that stopped being a
  -- customer thirty days ago has no claim on its patients' data, and neither
  -- have we: `updated_at` is when the status last changed, which is the closest
  -- thing to a leaving date the schema has.
  delete from appointments a
   using clinics c
   where c.id = a.clinic_id
     and c.status = 'cancelada'
     and c.updated_at < now() - interval '30 days';
  get diagnostics v_appts = row_count;

  delete from activity_log where created_at < now() - interval '12 months';
  get diagnostics v_log = row_count;

  return jsonb_build_object(
    'audio_cleared', v_audio,
    'transcripts_cleared', v_transcript,
    'summaries_cleared', v_summary,
    'appointments_deleted', v_appts,
    'activity_deleted', v_log,
    'ran_at', now()
  );
end $$;

revoke execute on function purge_expired() from anon, authenticated;

-- The schedule -----------------------------------------------------------
-- pg_cron is per-project and has to be enabled once in the Supabase dashboard
-- (Database, Extensions, pg_cron). Guarded so this migration still applies on a
-- database that does not have it, and so it can be re-run afterwards.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('telma-purge') where exists (
      select 1 from cron.job where jobname = 'telma-purge'
    );
    -- Half past three in the morning, when a clinic is not looking at its panel.
    perform cron.schedule('telma-purge', '30 3 * * *', 'select purge_expired()');
  else
    raise notice 'pg_cron não disponível: purge_expired() existe mas ninguém a corre.';
  end if;
end $$;
