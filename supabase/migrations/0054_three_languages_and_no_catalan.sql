-- What Telma actually speaks, and how much of it each plan buys.
--
-- Three languages exist today: Portuguese, Spanish and English. Everything
-- else is on the list so a clinic can see it is coming, and is not sellable.
--
-- Catalan moves out of 'available', which is the correction. It was offered
-- at sign-up and on the account page, and the voice platform has no Catalan
-- at all: the agent's own wiring script says so in a comment and falls back
-- to the Spanish voice. A clinic in Barcelona could tick it and get a
-- Castilian voice reading Catalan, which is not the thing it bought.
update public.available_languages
   set status = 'coming_soon', updated_at = now()
 where code = 'ca';

-- One, two, three. The ceilings were 2 / 3 / 4, which counted the base
-- language as an extra and so sold Essencial a second language that the
-- product does not have a third of.
update public.plans set max_languages_included = 1, updated_at = now() where id = 'essencial';
update public.plans set max_languages_included = 2, updated_at = now() where id = 'clinica';
update public.plans set max_languages_included = 3, updated_at = now() where id = 'rede';
