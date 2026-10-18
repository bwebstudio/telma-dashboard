-- The offer is the one published on telmaatende.com, and the table now says it.
--
-- Annual is ten monthly payments: the site shows it as "2 meses grátis" and the
-- Stripe annual prices charge exactly that (990 / 2490 / 5990). The table had
-- eleven (1089 / 2741 / 6589), so the sign-up's price card and /conta showed a
-- figure the checkout then did not charge.
--
-- Clínica is sold as one clinic. The table gave it three locations, which the
-- sign-up printed as "3 sedes incluídas" and nothing on the site offers. The
-- column grants nothing by itself (it is shown on /conta and passed to the
-- agent as context), but a number on a price card is a promise.
--
-- Applied to production by hand on 2026-10-18; this file records it so a
-- re-run of 0014, which upserts the old figures, cannot bring them back.

update public.plans set price_annual_eur = 990,  updated_at = now() where id = 'essencial';
update public.plans set price_annual_eur = 2490, max_locations = 1, updated_at = now() where id = 'clinica';
update public.plans set price_annual_eur = 5990, updated_at = now() where id = 'rede';
