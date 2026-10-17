-- Números comprados antes de fazerem falta.
--
-- A Twilio não vende números portugueses nem espanhóis pela API: confirmaram
-- por escrito que é uma limitação da plataforma e não da nossa conta, e que
-- não existe API para submeter nem para acompanhar os pedidos. Portugal
-- demora 3 a 5 dias úteis, Espanha entre 1 e 24 horas.
--
-- O que confirmaram também é a saída: um regulatory bundle aprovado serve
-- para mais números do mesmo tipo e país, sem voltar a submeter papelada. Ou
-- seja, podemos encomendar dez de uma vez e guardá-los.
--
-- Com isso a espera deixa de existir para a clínica. A inscrição tira um
-- número da prateleira e a linha fica viva no mesmo minuto; quem repõe a
-- prateleira somos nós, com dias de antecedência e sem ninguém à espera.
--
-- Cada número parado custa cerca de 3,45 USD por mês. É o preço de não ter
-- um cliente parado cinco dias, e é um custo que se escolhe: a prateleira
-- tem o tamanho que lhe dermos.
create table if not exists public.phone_stock (
  id uuid primary key default gen_random_uuid(),
  -- E.164, como a Twilio o devolve.
  number text not null unique,
  -- O sid da Twilio, para o apontar e, um dia, o libertar.
  provider_ref text not null unique,
  country text not null check (country in ('PT', 'ES')),
  -- A região do indicativo, quando a sabemos. Uma clínica de Málaga atendida
  -- num número de Madrid lê-se como um call center, que é precisamente a
  -- impressão que a Telma existe para evitar.
  region text,
  -- A clínica que o levou. Nulo enquanto está na prateleira.
  clinic_id uuid references public.clinics(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- A pergunta que esta tabela responde a cada inscrição: há algum livre deste
-- país? Com a região à frente, porque é a que preferimos.
create index if not exists phone_stock_free_idx
  on public.phone_stock (country, region)
  where clinic_id is null;

comment on table public.phone_stock is
  'Números comprados à Twilio antes de serem precisos, porque PT e ES não se compram pela API.';
