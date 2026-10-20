-- The calls that end before anybody says a word.
--
-- ── WHAT WAS MISSING ───────────────────────────────────────────────────────
-- A row in `calls` is written when the voice platform tells us a conversation
-- finished. Somebody who rings and hangs up while it is still ringing has no
-- conversation, so there was nothing to write and the call never existed as
-- far as the panel was concerned.
--
-- That is the one call a clinic most wants to see. The whole promise of this
-- product is "you are not losing calls any more", and a clinic cannot check
-- that against a list that only contains the calls that went well. The first
-- real client asked for it in writing: "gostávamos que as chamadas que não são
-- atendidas pelas assistentes fiquem todas registadas (mesmo as que a pessoa
-- desliga antes da Telma atender)".
--
-- ── HOW IT IS KNOWN ────────────────────────────────────────────────────────
-- Twilio tells us when a call ends, whatever became of it. What it cannot tell
-- us is whether Telma got as far as speaking, so the two moments that decide
-- it are written down as they happen, against the call id the network uses:
--
--   answered_at   the platform asked us who to be, so a conversation started
--   rejected_at   we answered with the engaged tone, so there was never a call
--                 to miss: the clinic has left us or asked us to pause
--
-- A call that ends with neither of those is a call nobody answered.
alter table call_routes
  add column if not exists answered_at timestamptz,
  add column if not exists rejected_at timestamptz;

comment on column call_routes.answered_at is
  'When /api/voice/init handed this call its clinic, which is the moment a conversation began.';
comment on column call_routes.rejected_at is
  'When /api/voice/incoming refused the call with the engaged tone. Not a missed call: nobody was meant to answer.';

-- A day is long enough for the note to be read: the status callback arrives
-- seconds after the call ends. purge_call_routes() already clears them.

-- ── AND WHAT THE ROW SAYS IT WAS ───────────────────────────────────────────
-- A fifth result, beside the four a conversation can end in. It is not a
-- failure of Telma's and it must not read as one: nobody spoke to this person
-- because they hung up first.
alter type call_result add value if not exists 'nao_atendida';
