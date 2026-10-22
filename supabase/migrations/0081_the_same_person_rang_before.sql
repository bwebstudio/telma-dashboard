-- Finding every call one person has left open, cheaply.
--
-- ── WHAT ASKS FOR THIS ─────────────────────────────────────────────────────
-- Marking a call dealt with closes the conversation, not the line. Somebody
-- rang on Monday and nobody got back to them, rang again on Wednesday, rang
-- again this morning; reception finally speaks to them and the two older
-- lines are not pending any more, they were the same thing being asked three
-- times. Leaving them open teaches the clinic that the day's list lies, and a
-- list that lies is a list nobody works through.
--
-- So one press now asks "everything this number left open, up to this call",
-- and that question needs the number, the clinic and the hour together.
--
-- The column it leans on already exists: `calls.from_digits` has been the
-- last nine digits of `from_phone` since 0070, the same expression as
-- `patients.phone_digits` from 0046, which is why a caller arriving as
-- +351912345678 one day and 912 345 678 the next is recognised as one person.
-- 0070 indexed it by clinic and number, which answers "this person's calls".
-- This adds the hour, so the rows come back already in the order the question
-- cuts them by, with no sort over a clinic's whole history with somebody.
--
-- Partial, because a call with no number at all is nobody and can never be
-- grouped with anything.
create index if not exists idx_calls_clinic_digits
  on calls (clinic_id, from_digits, created_at desc)
  where from_digits <> '';
