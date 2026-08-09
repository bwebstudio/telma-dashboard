-- A primeira conta, num projecto acabado de criar.
--
-- ── PORQUE É QUE ISTO EXISTE ────────────────────────────────────────────────
-- A migração 0010 recusa-se a terminar se não sobrar ninguém com role
-- 'interno'. Numa base que já corria, sobra. Numa base nova, `public.users`
-- está vazia e a migração pára com:
--
--   No internal account left. Create info@bwebstudio.com in Supabase Auth,
--   insert its row in public.users, then run this migration again.
--
-- A mensagem está certa e a recusa também: uma migração que deixasse o painel
-- sem administrador seria pior do que uma migração que pára. O que faltava era
-- este ficheiro, para que montar um ambiente do zero não dependa de alguém se
-- lembrar do passo.
--
-- ── COMO SE USA ─────────────────────────────────────────────────────────────
-- 1. No painel da Supabase: Authentication > Users > Add user
--       email:    info@bwebstudio.com
--       password: a que quiser
--       Auto Confirm User: LIGADO
--    Sem confirmar, a conta existe e não entra, o que se descobre tarde.
--
-- 2. Correr este ficheiro no SQL Editor.
--
-- 3. Correr a 0010 outra vez, e seguir com as restantes.
--
-- Não é preciso copiar nenhum id: a conta é procurada pelo email.

do $$
declare
  v_id uuid;
begin
  select id into v_id
    from auth.users
   where lower(email) = 'info@bwebstudio.com'
   limit 1;

  if v_id is null then
    raise exception
      'Ainda não existe info@bwebstudio.com em Authentication > Users. Crie-a primeiro, com Auto Confirm ligado.';
  end if;

  -- `clinic_id` fica nulo de propósito: a restrição role_clinic_consistency diz
  -- que quem é interno não pertence a nenhuma clínica, e é isso que separa quem
  -- opera o produto de quem o usa.
  insert into public.users (id, email, full_name, role, clinic_id, locale)
  values (v_id, 'info@bwebstudio.com', 'Telma', 'interno', null, 'pt')
  on conflict (id) do update
     set role = 'interno',
         clinic_id = null,
         email = excluded.email;

  raise notice 'Conta interna pronta: %', v_id;
end $$;
