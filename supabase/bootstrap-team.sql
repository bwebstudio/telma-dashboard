-- As contas da equipa, num ambiente novo que NÃO seja de demonstração.
--
-- ── PORQUE É QUE ISTO É PRECISO ─────────────────────────────────────────────
-- As contas não vivem no código nem nas migrações: vivem na base de dados, uma
-- por pessoa. Trocar um projecto de Supabase por outro troca também toda a
-- gente que lá entrava. Depois de apontar o painel para uma base nova, o Domingos
-- e a Sónia deixam de entrar, e a mensagem que recebem é "credenciais inválidas",
-- que manda procurar no sítio errado.
--
-- Um comercial precisa de três coisas, e faltar qualquer uma deixa-o a meio:
--   1. a conta em auth.users, para entrar
--   2. a linha em public.users com role 'comercial', para o painel saber quem é
--   3. a linha em crm_reps, que é o que lhe dá prospectos e território
--
-- ── COMO SE USA ─────────────────────────────────────────────────────────────
-- Escreva a palavra-passe na linha v_password e corra. É idempotente: quem já
-- existir fica como está, com a palavra-passe que já tinha.
--
-- ── NÃO CORRER NUMA DEMONSTRAÇÃO ────────────────────────────────────────────
-- Uma demonstração tem um papel só, o da clínica. O painel interno e o CRM são
-- onde a Sónia e o Domingos trabalham a sério, a ligar a consultórios e a marcar
-- lembretes, e nada que se dê a estranhos tem que os desenhar. Numa demonstração
-- `showcaseMode()` fecha esses painéis de qualquer maneira, e as contas não
-- devem lá estar sequer.
--
-- Para produção não use isto com uma palavra-passe partilhada. Crie cada conta
-- pelo painel, com a sua.

do $$
declare
  v_password text := 'MUDE-ME';
  v_id       uuid;
  p          record;
begin
  if v_password = 'MUDE-ME' then
    raise exception 'Escreva a palavra-passe na linha v_password antes de correr.';
  end if;

  for p in
    select * from (values
      ('domingospintocoelho@gmail.com', 'Domingos',        'comercial', 'pt', 'PT', null,        'admin'),
      ('soniasangla@gmail.com',         'Sonia',           'comercial', 'es', 'ES', 'Barcelona', 'comercial'),
      ('demo@bwebstudio.com',           'Receção Sorriso', 'clinica',   'pt', null, null,        null)
    ) as t(email, full_name, role, locale, country, territory, crm_role)
  loop
    select id into v_id from auth.users where lower(email) = p.email;

    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        p.email, extensions.crypt(v_password, extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      );
      -- Sem a identidade o login por email não encontra a conta, e o erro que dá
      -- é "credenciais inválidas".
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', p.email, 'email_verified', true),
              'email', now(), now());
      -- O GoTrue lê estas colunas para string, e um NULL rebenta lá dentro. O
      -- que chega ao browser é "credenciais inválidas", que manda toda a gente
      -- verificar a palavra-passe. É o preço de criar contas por SQL, e é a
      -- razão pela qual o painel é a via suportada.
      update auth.users
         set confirmation_token = coalesce(confirmation_token, ''),
             recovery_token = coalesce(recovery_token, ''),
             email_change = coalesce(email_change, ''),
             email_change_token_new = coalesce(email_change_token_new, ''),
             email_change_token_current = coalesce(email_change_token_current, ''),
             phone_change = coalesce(phone_change, ''),
             phone_change_token = coalesce(phone_change_token, ''),
             reauthentication_token = coalesce(reauthentication_token, '')
       where id = v_id;
      raise notice 'Conta criada: %', p.email;
    else
      raise notice 'Já existia: %', p.email;
    end if;

    -- A clínica de demonstração é a da semente. Um utilizador com role 'clinica'
    -- tem de pertencer a uma, e um interno ou comercial não pode pertencer a
    -- nenhuma: é a restrição role_clinic_consistency.
    insert into public.users (id, email, full_name, role, clinic_id, locale)
    values (
      v_id, p.email, p.full_name, p.role::user_role,
      case when p.role = 'clinica' then '11111111-1111-1111-1111-111111111111'::uuid end,
      p.locale
    )
    on conflict (id) do update
      set role = excluded.role,
          full_name = excluded.full_name,
          clinic_id = excluded.clinic_id,
          locale = excluded.locale;

    if p.crm_role is not null then
      insert into public.crm_reps (id, full_name, email, country, territory, role, active)
      values (v_id, p.full_name, p.email, p.country::crm_country, p.territory, p.crm_role::crm_rep_role, true)
      on conflict (id) do update
        set country = excluded.country,
            territory = excluded.territory,
            role = excluded.role,
            active = true;
    end if;
  end loop;
end $$;
