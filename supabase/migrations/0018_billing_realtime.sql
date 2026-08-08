-- The billing rows broadcast their changes too.
--
-- 0002 put appointments, calls and activity_log on the wire, which is what the
-- agenda needs. The minutes bar and the receipts read three other tables, and a
-- panel left open all morning would keep showing the allowance the clinic had
-- at breakfast: the meter moves every time Telma finishes a call, and a
-- purchase made on a phone should show up on the desktop that is already open.
--
-- Realtime respects Row Level Security, so what goes out on this publication is
-- still only what the signed in clinic could have read by asking. The panel's
-- subscriptions are filtered by clinic on top of that, to keep one clinic's
-- write from waking every other open panel.
do $$ begin
  alter publication supabase_realtime add table clinics;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table usage;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table purchases;
exception when duplicate_object then null; end $$;
