-- What the call was about, and not only what came of it.
--
-- ── WHY FOUR MORE ──────────────────────────────────────────────────────────
-- The four results were written for a clinic with a diary, where what came of
-- a call is the whole story: a booking, a transfer, an answer, or nothing.
--
-- On a clinic that only takes messages, nothing ever comes of a call in that
-- sense. Somebody rings to book: message. Somebody rings to cancel: message.
-- Somebody asks a price: message. All three are filed as `informacao`, so the
-- day's list is a column of identical chips and the only way to tell a
-- cancellation from a price question is to read fifteen summaries.
--
-- Reception reads that list the way anybody reads a list: by the shape of it.
-- The chip has to say what the person wanted.
--
-- ── AND ONE OF THEM IS NOT COSMETIC ────────────────────────────────────────
-- `urgencia`. Somebody describes an emergency out of hours, Telma sends them
-- to 112 and writes it down, and at eight in the morning that line has to be
-- the one the desk sees first. Filed as `informacao` it sits between a price
-- and a parking question, in the same grey.
--
-- ── WHAT STAYS AS IT WAS ───────────────────────────────────────────────────
-- `marcacao` is still an appointment that exists, and `cancelamento` is its
-- mirror: one that was actually cancelled, which only a clinic with a diary
-- can do. The two `pedido_` ones are the wanting, not the doing, which is all
-- a clinic without a diary ever records.
alter type call_result add value if not exists 'pedido_marcacao';
alter type call_result add value if not exists 'pedido_cancelamento';
alter type call_result add value if not exists 'cancelamento';
alter type call_result add value if not exists 'urgencia';

comment on column calls.result is
  'What the call was about. marcacao and cancelamento are things that happened '
  'in the diary; pedido_marcacao and pedido_cancelamento are things somebody '
  'asked for, which is all a clinic without a diary can record; urgencia is '
  'the one that has to be read first.';
