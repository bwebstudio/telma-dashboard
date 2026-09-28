-- Appointments that never happened, and the reason somebody came.
--
-- `purge_expired()` deletes an appointment only when the clinic itself was
-- cancelled thirty days ago. For a working clinic, every appointment it has
-- ever had is kept for ever — with the patient's name, telephone number and
-- the reason they were coming.
--
-- That sits badly against what the same function already does one screen up:
-- it clears `calls.from_phone` at ninety days, and the comment explains why —
-- a call that has lost its summary has no use for a telephone number, and a
-- number identifies a person as surely as a name. The identical number was
-- being kept for ever, two tables away, on the appointment that call created.
--
-- ── WHAT STAYS ─────────────────────────────────────────────────────────────
-- Appointments that happened. They are the clinic's own record of hours it
-- worked and billed, and they are how anybody knows whether a caller has been
-- here before. Taking them away would answer a privacy question by breaking
-- the business.
--
-- ── WHAT GOES, AND WHEN ────────────────────────────────────────────────────
-- The ones that did not happen: cancelled, refused, expired. After ninety days
-- they are noise — long enough to see that somebody cancelled twice last
-- month, short enough not to be an archive of people who never came.
--
-- Anonymised rather than deleted, for the reason 0040 already gives for the
-- erasure path: the hour is also the clinic's record of a Tuesday afternoon
-- that freed up. The booking stays, the person in it goes.
--
-- ── AND THE REASON, SOONER ─────────────────────────────────────────────────
-- `reason` is the closest thing to health data this schema holds: it is why a
-- person came to a clinic. It outlives the call that produced it by years,
-- while the call's own summary — the same information, in the patient's own
-- words — is cleared at ninety days.
--
-- So it goes at ninety days too, on every appointment, whatever its state. The
-- clinic keeps the appointment, the hour and the name; what it loses is the
-- line saying what the person was being treated for, which after three months
-- is in the clinic's own records and not ours to hold.

create or replace function purge_appointments() returns jsonb language plpgsql as $$
declare
  v_never integer;
  v_reason integer;
begin
  -- Cancelled, refused, expired, older than ninety days.
  update appointments
     set patient_name = 'Anonimizado',
         patient_phone = '',
         summary = null,
         reason = null
   where status in ('cancelada', 'rejeitada', 'expirada')
     and scheduled_at < now() - interval '90 days'
     and patient_phone <> '';
  get diagnostics v_never = row_count;

  -- And the reason, on everything, at the same age as the call summary it came
  -- from.
  update appointments
     set reason = null
   where reason is not null
     and scheduled_at < now() - interval '90 days';
  get diagnostics v_reason = row_count;

  return jsonb_build_object('never_happened', v_never, 'reasons_cleared', v_reason);
end;
$$;

comment on function purge_appointments is
  'Anonymises appointments that never happened after 90 days, and clears the '
  'reason for visit on all of them at the same age. Called by purge_expired.';

-- ── HOW IT GETS RUN ─────────────────────────────────────────────────────────
-- Its own function and its own line in the same nightly job, rather than being
-- folded into purge_expired(). Folding it in would mean copying that function's
-- body into this migration to add two statements to the end of it, and the
-- copy is the problem: 0039 would still be the file somebody edits, and this
-- one would silently win. Two names in one schedule is cheaper than two
-- versions of one function.

revoke execute on function purge_appointments() from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('telma-purge') where exists (
      select 1 from cron.job where jobname = 'telma-purge'
    );
    -- Both, in one statement, at the same half past three: one job to check is
    -- still running, and a single report line if anybody looks.
    perform cron.schedule(
      'telma-purge',
      '30 3 * * *',
      'select purge_expired() || purge_appointments()'
    );
  else
    raise notice 'pg_cron nao disponivel: purge_appointments() existe mas ninguem a corre.';
  end if;
end $$;
