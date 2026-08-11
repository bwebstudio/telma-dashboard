-- A price against a service, instead of a paragraph about prices.
--
-- `price_info` is free text and always was: "Primeira consulta 40 €. Limpeza a
-- partir de 60 €." It survives, because a real price list has sentences in it
-- that no table holds ("laser from 60 € depending on the area"), and because
-- some clinics quote nothing and say so.
--
-- What it should never have been is the only place a price could go. It is the
-- field a clinic charges money with, typed into a box with no shape, so a
-- number that ends up in the wrong sentence is read out loud to a patient with
-- no way for anything to notice. A number against a service can at least be
-- shown back beside the service it belongs to.
--
-- Euros, and only euros: both countries this serves use them, and a currency
-- column would be a column with one value in it.
alter table clinics add column if not exists service_prices jsonb not null default '{}'::jsonb;

comment on column clinics.service_prices is
  '{ "<service id or custom service name>": <price in euros> }. Absent means the '
  'clinic quotes no price for that service, which is a real answer: Telma says '
  'so and offers to have somebody call back.';
