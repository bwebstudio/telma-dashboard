-- Telma answering on WhatsApp, and the one column it needs.
--
-- ── WHY A COLUMN AND NOT A TABLE ───────────────────────────────────────────
-- A WhatsApp thread is a conversation with a patient, which is what `calls`
-- already is: `channel` has said 'telefone' | 'whatsapp' since 0012 and the
-- panel's own copy says "ao telefone e no WhatsApp". One row per thread keeps
-- the receptionist's day a single timeline, which is the thing the product
-- sells, and it means the chips, the handled state, the patient record and the
-- counters all work on day one without learning a second shape.
--
-- What a thread has and a call does not is the words. A telephone call's
-- transcript lives at the voice platform for seven days and the panel only
-- ever shows the summary; a WhatsApp thread has to be read back turn by turn,
-- because the next reply depends on it and because the clinic will want to see
-- what was actually said.
--
-- ── AND WHY `transcript` WAS ALREADY DECLARED ──────────────────────────────
-- lib/types.ts has carried `transcript: TranscriptTurn[] | null` on `Call`
-- since the type was written, and the column has never existed. The drift was
-- harmless while nothing read it and is the first thing this feature trips
-- over, so it is closed here rather than worked around.
alter table calls add column if not exists transcript jsonb;

comment on column calls.transcript is
  'The turns of a conversation, oldest first, as [{"role":"patient"|"telma", '
  '"text":"...","at":"<iso>"}]. Written for WhatsApp, where the thread is the '
  'record and the next reply is built from it. Null on a telephone call, whose '
  'words stay at the voice platform.';

-- ── FINDING THE THREAD THIS MESSAGE BELONGS TO ────────────────────────────
-- Every inbound message asks the same question: is there an open thread for
-- this number at this clinic? That is (clinic, digits, channel) ordered by
-- time, and 0081 already indexes (clinic, digits, created_at) for the panel's
-- patient lookup. This adds the channel, so a clinic with four thousand calls
-- and forty threads does not read the four thousand to find the forty.
create index if not exists idx_calls_clinic_channel_digits_time
  on calls (clinic_id, channel, from_digits, created_at desc);
