-- One invoice, one purchase, however many times Stripe tells us about it.
--
-- ── WHAT HAPPENED ──────────────────────────────────────────────────────────
-- A test sign-up paid once and the clinic's billing screen showed 249 EUR
-- twice: two `purchases` rows, same `stripe_invoice_id`, one second apart.
-- Stripe charged once. What arrived twice was `checkout.session.completed`,
-- and the handler inserts unconditionally.
--
-- Webhooks are at-least-once delivery, which Stripe documents and which this
-- codebase already had to learn for calls: 0056 gave `record_call` the same
-- treatment after a retry billed a conversation twice. The same reasoning was
-- never applied to the thing that is literally money.
--
-- It is intermittent, which is why it survived. The sign-up two days earlier
-- produced exactly one row. Nothing in the code decides it: the duplicate
-- happens when Stripe decides to redeliver.
--
-- ── THE RULE ───────────────────────────────────────────────────────────────
-- An invoice line is one purchase. Not a partial index, deliberately: a plain
-- unique index already ignores rows whose `stripe_invoice_id` is null, since
-- null never equals null in a unique index, and a plain one can be named as
-- an ON CONFLICT target by PostgREST while a partial one cannot.
--
-- `item_id` is in the key so one invoice may still carry a plan and an add-on
-- as separate lines, which is what an upgrade with an extra looks like.

-- The duplicates already written, oldest row of each group kept.
delete from public.purchases p
 using public.purchases older
 where p.stripe_invoice_id is not null
   and older.stripe_invoice_id = p.stripe_invoice_id
   and older.clinic_id = p.clinic_id
   and older.item_id = p.item_id
   and (older.purchased_at, older.id) < (p.purchased_at, p.id);

create unique index if not exists idx_purchases_one_per_invoice_line
  on public.purchases (clinic_id, stripe_invoice_id, item_id);

comment on index public.idx_purchases_one_per_invoice_line is
  'At-least-once webhook delivery: the second copy of an event must not become a second charge on the clinic''s billing screen.';
