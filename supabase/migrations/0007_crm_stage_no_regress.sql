-- Failing to reach somebody must not erase what a conversation already proved.
--
-- The first version mapped every "could not reach" outcome (no answer, busy,
-- lunch break, on holiday, reception without the decision maker) to the
-- 'attempting' stage. That is right for a clinic nobody has spoken to yet, and
-- wrong for one that already said it was interested: three unanswered calls
-- would quietly demote it and the funnel would lose the best lead of the week.
--
-- Real case that surfaced this: All Family Dental Clinic was recorded as "fez
-- muitas perguntas, muito interessada" on 27/07, and then went unanswered three
-- times on 29/07. It has to stay "Interessada" with three attempts logged.
--
-- So: an attempt only ever moves a prospect off 'new'. Anything that reports an
-- actual conversation (spoke to the decision maker, interested, meeting, won,
-- lost) is a statement the rep is making on purpose and is always applied,
-- forwards or backwards.

create or replace function crm_apply_activity()
returns trigger language plpgsql as $$
declare
  v_stage  crm_stage := crm_stage_from_result(new.result);
  v_closed boolean   := v_stage in ('won', 'lost');
begin
  update crm_prospects p set
    stage = case
      -- A plain note, or result 'other': the stage is not this activity's business.
      when v_stage is null then p.stage
      -- Could not reach them. Only meaningful while nobody ever has.
      when v_stage = 'attempting' and p.stage <> 'new' then p.stage
      else v_stage
    end,
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

-- ── FOLDED IN FROM 0007_crm_veterinary ──────────────────────────────────────
-- Veterinary clinics are a target segment too: they take bookings by phone all
-- day and lose the calls they cannot answer, exactly like a dental practice.
--
-- This arrived as a second file numbered 0007, and two files cannot share a
-- version: supabase_migrations.schema_migrations keys on it, so the second one
-- could never be recorded and `db push` failed on the insert every time, after
-- the statement itself had already run and skipped.
--
-- It could not simply be renumbered to the end either. 0027 files prospects
-- under this value, so on a database built from scratch the value has to exist
-- by then.
--
-- So it lives here, last in the file. The note it carried said it had to be on
-- its own because Postgres will not use a freshly added enum value inside the
-- transaction that added it — and nothing above uses crm_specialty at all,
-- which is what makes this position safe rather than merely convenient.
alter type crm_specialty add value if not exists 'veterinary';
