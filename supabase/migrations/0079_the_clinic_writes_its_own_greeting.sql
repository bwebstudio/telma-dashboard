-- The first sentence, in the clinic's own words.
--
-- ── WHY THIS IS NOT A SETTING WE INVENTED ──────────────────────────────────
-- The first real client sent their greeting written out, before anything
-- else, and it is not a variation on ours: it says that nobody can take the
-- call right now, that somebody will be in touch, and it asks for the reason
-- in those words because that is what their patients are used to hearing.
-- Until now the only thing a clinic could change about it was its own name.
--
-- ── WHAT STAYS OURS ────────────────────────────────────────────────────────
-- Two things are added after whatever the clinic writes, and cannot be
-- removed by writing around them:
--
--   the recording notice, when audio is kept. It is what makes the recording
--   lawful, and a clinic that deletes it by accident has not made the
--   recording lawful by writing a nicer sentence. See lib/recording.
--
--   the other languages this clinic answers in, when there are any, because
--   somebody who does not speak the one she opened in has to be told how to
--   ask for theirs.
--
-- Null means the greeting we write, which is what almost every clinic should
-- use: it is short, it says who is speaking, and it gets out of the way.
alter table clinics
  add column if not exists greeting text
    check (greeting is null or length(btrim(greeting)) between 10 and 400);

comment on column clinics.greeting is
  'What Telma says when she answers, in the clinic''s own words. Null means the standard line. The recording notice and the language menu are appended by us.';
