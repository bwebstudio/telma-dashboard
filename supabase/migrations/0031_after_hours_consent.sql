-- Quem pode ser acordado às três da manhã, e com que condições.
--
-- Até aqui o prompt mandava passar a chamada a uma pessoa sempre que fosse uma
-- urgência dentro do horário, e fora de horas dava o número de urgências. O que
-- faltava era a pergunta que a clínica tem de responder e ninguém lhe fez:
-- aceita que lhe liguem de madrugada, e a quem.
--
-- Sem isto, uma pessoa que ligue às três e diga "quero falar com o médico" faz
-- tocar o telefone de alguém que nunca concordou com isso. Um consentimento por
-- omissão não é consentimento, por isso a coluna entra a `false` e a clínica
-- tem de a ligar de propósito.
--
-- Idempotente: pode correr duas vezes.

alter table public.clinics
  add column if not exists after_hours_transfer boolean not null default false,
  add column if not exists after_hours_number text,
  add column if not exists after_hours_patients_only boolean not null default true;

comment on column public.clinics.after_hours_transfer is
  'A clínica aceita que lhe passem chamadas fora do horário. Falso por omissão: passar uma chamada de madrugada a quem não concordou é pior do que não a passar.';
comment on column public.clinics.after_hours_number is
  'Para onde vai uma urgência fora de horas. Quando é nulo usa-se emergency_number.';
comment on column public.clinics.after_hours_patients_only is
  'Só se passa fora de horas quem já é paciente da clínica. Verdadeiro por omissão.';

-- Acentos fora, sem depender da extensão unaccent, que nem sempre está instalada
-- em Postgres gerido. Cobre o que aparece em nomes portugueses e espanhóis.
create or replace function public.unaccent_simple(t text)
returns text
language sql
immutable
as $$
  select translate(
    t,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- Quem já é paciente desta clínica, por número de telefone.
--
-- Não há tabela de pacientes e não faz falta: paciente é quem tem, ou teve, uma
-- marcação aqui. A pergunta faz-se pelo número de onde a pessoa está a ligar, que
-- é o que a central entrega e a única coisa que ela não pode inventar ao telefone.
--
-- Só os dígitos são comparados: o mesmo telefone chega escrito de cinco maneiras
-- conforme quem o escreveu.
create or replace function public.is_clinic_patient(
  p_clinic_id uuid,
  p_phone text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.appointments a
     where a.clinic_id = p_clinic_id
       and p_phone is not null
       and length(regexp_replace(p_phone, '\D', '', 'g')) >= 8
       and right(regexp_replace(a.patient_phone, '\D', '', 'g'), 9)
         = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
  );
$$;

-- As marcações futuras de um número, para quem liga a cancelar.
--
-- Devolve deliberadamente o mínimo: identificador, hora e motivo. **Não devolve
-- o nome.** Quem liga tem de o dizer, e é o servidor que compara, porque uma
-- verificação que consiste em ler o nome em voz alta e perguntar "é este?" não
-- verifica nada: dá a resposta antes da pergunta.
create or replace function public.appointments_by_phone(
  p_clinic_id uuid,
  p_phone text
) returns table (
  id uuid,
  scheduled_at timestamptz,
  reason text,
  status appointment_status
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.scheduled_at, a.reason, a.status
    from public.appointments a
   where a.clinic_id = p_clinic_id
     and a.scheduled_at > now()
     and a.status in ('pendente', 'confirmada')
     and length(regexp_replace(p_phone, '\D', '', 'g')) >= 8
     and right(regexp_replace(a.patient_phone, '\D', '', 'g'), 9)
       = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
   order by a.scheduled_at;
$$;

-- Cancelar, com o nome a ser conferido aqui e não no prompt.
--
-- A comparação é por palavras: cada palavra do nome que a pessoa disse tem de
-- aparecer no nome guardado, e têm de ser pelo menos duas. Assim "Alfredo
-- Sánchez" abre a marcação de "Alfredo Sánchez Pumier", que é como as pessoas
-- se identificam ao telefone, e "Alfredo" sozinho não abre nada.
--
-- Está em SQL, e não no texto do prompt, porque uma regra escrita no prompt é
-- uma regra que se pode contornar a falar.
create or replace function public.cancel_appointment_by_phone(
  p_clinic_id uuid,
  p_appointment_id uuid,
  p_phone text,
  p_name text,
  p_reason text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_stored text;
  v_words int := 0;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
     and clinic_id = p_clinic_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  end if;

  if right(regexp_replace(coalesce(v_appt.patient_phone, ''), '\D', '', 'g'), 9)
     <> right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) then
    return jsonb_build_object('ok', false, 'error', 'phone_does_not_match');
  end if;

  if v_appt.status not in ('pendente', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable',
                              'status', v_appt.status);
  end if;

  v_stored := lower(unaccent_simple(coalesce(v_appt.patient_name, '')));

  select count(*) into v_words
    from regexp_split_to_table(lower(unaccent_simple(coalesce(p_name, ''))), '\s+') w
   where length(w) >= 3;

  if v_words < 2 then
    return jsonb_build_object('ok', false, 'error', 'name_too_short');
  end if;

  if exists (
    select 1
      from regexp_split_to_table(lower(unaccent_simple(coalesce(p_name, ''))), '\s+') w
     where length(w) >= 3
       and position(w in v_stored) = 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'name_does_not_match');
  end if;

  update public.appointments
     set status = 'cancelada',
         cancelled_at = now(),
         cancelled_by = 'telma',
         cancel_reason = p_reason
   where id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id);
end;
$$;
