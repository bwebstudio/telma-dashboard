-- Criar a conta de autenticação sem passar pelo painel.
--
-- ── LEIA ISTO ANTES ─────────────────────────────────────────────────────────
-- A maneira suportada de criar uma conta é Authentication > Users > Add user,
-- ou a Admin API. Escrever directamente em `auth.users` é território da
-- Supabase, e um dia mudam uma coluna e isto parte.
--
-- Existe para uma coisa só: montar um ambiente do zero de uma vez, sem alguém a
-- clicar a meio da lista de migrações. Se puder clicar, clique.
--
-- É idempotente: correr duas vezes não duplica nem altera a palavra-passe.

do $$
declare
  v_email text := 'info@bwebstudio.com';
  -- Escreva aqui a palavra-passe antes de correr. Uma linha, à vista, em vez de
  -- uma definição de sessão: pelo pooler cada instrução pode apanhar outra
  -- ligação, e a definição desaparecia antes de alguém a ler.
  v_password text := 'MUDE-ME';
  v_id uuid;
begin
  if v_password = 'MUDE-ME' then
    raise exception 'Escreva a palavra-passe na linha v_password antes de correr.';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is not null then
    raise notice 'Já existia: %', v_id;
    return;
  end if;

  v_id := gen_random_uuid();

  -- `email_confirmed_at` preenchido de propósito. Uma conta por confirmar
  -- existe e não entra, e isso descobre-se no login, longe daqui.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  -- Sem a identidade, as versões novas do GoTrue não encontram a conta ao
  -- entrar por email, e o erro que dão é "credenciais inválidas": o pior erro
  -- possível, porque manda procurar no sítio errado.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  );

  raise notice 'Criada: %', v_id;
end $$;
