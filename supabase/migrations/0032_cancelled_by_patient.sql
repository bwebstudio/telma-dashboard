-- Quem cancela ao telefone é o paciente, não a Telma.
--
-- 0031 escrevia `cancelled_by = 'telma'` e o check de 0012 só aceita 'paciente'
-- ou 'clinica'. O cancelamento rebentava com um 500 depois de já ter verificado
-- o número e o nome: o pior sítio possível para falhar, porque a pessoa ao
-- telefone já tinha feito tudo bem.
--
-- 'paciente' não é só o valor que passa no check, é o valor certo. A Telma é o
-- meio, como o telefone é o meio quando liga a uma rececionista humana, e o
-- painel já sabe desenhar "cancelada pelo paciente" para este valor. Escrever
-- 'telma' teria acrescentado um terceiro caso a toda a interface para dizer a
-- mesma coisa.
--
-- Quem foi ao certo fica em `cancel_reason`, que é texto livre e é onde uma
-- rececionista escreveria a mesma nota.

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
         cancelled_by = 'paciente',
         cancel_reason = coalesce(p_reason, 'Cancelada por telefone, com a Telma')
   where id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id);
end;
$$;
