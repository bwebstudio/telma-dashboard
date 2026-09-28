-- Los minutos de cada plan, puestos donde el margen aguanta.
--
-- Los precios no se tocan. Lo que se corrige es cuántos minutos incluye cada
-- uno, porque la cuenta nunca se había hecho contra una factura real y la
-- escalera salía al revés de lo que parecía.
--
-- ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
-- La factura de ElevenLabs de agosto (JENSIDK0-0002) da 0,151 € el minuto
-- hablado. Con Twilio y los SMS de confirmación dentro, un minuto de Telma nos
-- cuesta unos 0,22 €, y ese coste es idéntico en los tres planes: los mensajes
-- crecen con las llamadas y las llamadas con los minutos.
--
-- Lo único que cambiaba entre planes era lo que cobramos por ese minuto, y así
-- quedaba, contando también los 9,70 € fijos de cada clínica:
--
--   Essencial   99 € / 250 min    0,396 €/min    34 % de margen
--   Clínica    249 € / 750 min    0,332 €/min    29 %
--   Rede       599 € / 2000 min   0,299 €/min    24 %
--
-- El plan que se le vende a quien más gasta era el que menos dejaba. Bajar sólo
-- Rede no lo arregla: lo pone en cabeza y deja a Clínica en último lugar. Así
-- que se corrige la escalera entera.
--
-- ── ESSENCIAL NO SE TOCA, Y ES UNA DECISIÓN ────────────────────────────────
-- Se queda en 34 %, el más fino de los tres, a propósito. Es el plan con el que
-- entra un cliente que no nos conoce, y ese margen es lo que cuesta el primer
-- sí. Lo pagan los otros dos.
--
-- Ahora es gratis hacerlo: no hay ni un cliente de pago. Con diez firmados sería
-- una renegociación con diez personas.

update plans set max_minutes_per_month = 650 where id = 'clinica';
update plans set max_minutes_per_month = 1600 where id = 'rede';
update plans set description = 'Para mais de 5 sedes ou mais de 1600 minutos. Sob consulta'
 where id = 'personalizado';

-- ── Y LAS CLÍNICAS QUE YA EXISTEN ──────────────────────────────────────────
-- `clinics.minute_limit` es la copia que cada clínica lleva encima, y es la que
-- el panel mira. Sin esto, la de demostración seguiría diciendo 750 mientras su
-- plan dice 650, y la primera persona que lo notase tendría razón.
update clinics c
   set minute_limit = p.max_minutes_per_month
  from plans p
 -- `plans.id` es texto y `clinics.plan` es un enum, así que el cast no es
   -- decorativo: sin él Postgres rechaza la comparación entera.
 where p.id = c.plan::text
   and p.max_minutes_per_month is not null
   and c.minute_limit is distinct from p.max_minutes_per_month;

-- ── EL PACK DE MINUTOS ─────────────────────────────────────────────────────
-- 250 minutos por 79 € salían a 0,316 €/min contra un coste de 0,222: un 30 %
-- de margen, por debajo de todo lo demás. A 89 € son 0,356 €/min y un 38 %, que
-- es donde está el resto.
--
-- Se sube el precio en vez de bajar los minutos porque un pack es una compra de
-- impulso desde el panel: 250 es un número redondo que se entiende de un
-- vistazo, y 200 sólo se entendería comparándolo con el que había antes.
--
-- `unit_price_eur` no cambia: es el precio del minuto suelto, 0,35 €, y está
-- aquí para que el panel pueda enseñar que el pack sale más barato. Con 89 € la
-- diferencia se estrecha, y sigue existiendo.
update minute_packs
   set name = 'Pack de 250 minutos',
       price_eur = 89
 where id = 'pack_250';

-- ── Y LOS AVISOS, QUE SÍ GASTAN ─────────────────────────────────────────────
-- Las confirmaciones no pueden desbocarse: sólo sale una cuando la clínica
-- decide una cita, y las citas entran por llamada, y las llamadas gastan
-- minutos que ya están medidos. El techo lo pone el propio plan.
--
-- Los avisos programados sí. Los escribe una persona y pueden apuntar a la
-- lista entera de pacientes: ochocientos mensajes en un clic, unos 112 € que
-- nadie ha pagado.
--
-- Así que cuentan como un minuto cada uno. Un mensaje nos cuesta 0,14 € y un
-- minuto 0,17: cuestan casi lo mismo, de modo que no es un invento contable
-- sino la verdad redondeada a favor de la clínica. Y se capa solo, porque
-- cuando se acaban los minutos se acaban los avisos, sin contador nuevo, sin
-- unidad nueva y sin una línea más en la factura.
create or replace function charge_recall_minute(p_clinic_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_month  date := date_trunc('month', now())::date;
  v_used   numeric;
  v_limit  integer;
  v_extra  integer;
begin
  -- El mismo cálculo que hace el panel: lo que incluye el plan más lo que la
  -- clínica haya comprado encima.
  select coalesce(c.minute_limit, 0),
         coalesce((c.usage_this_month->>'extra_minutes_purchased')::integer, 0)
    into v_limit, v_extra
    from clinics c
   where c.id = p_clinic_id;
  if not found then return false; end if;

  select coalesce(minutes, 0) into v_used
    from usage where clinic_id = p_clinic_id and month = v_month;
  v_used := coalesce(v_used, 0);

  -- Sin sitio, no sale. El aviso se queda esperando en vez de cancelarse: la
  -- clínica compra un pack o espera al mes que viene, y en ninguno de los dos
  -- casos pierde lo que había programado.
  if v_used + 1 > v_limit + v_extra then
    return false;
  end if;

  insert into usage (clinic_id, month, calls_count, minutes)
  values (p_clinic_id, v_month, 0, 1)
  on conflict (clinic_id, month) do update
    set minutes = usage.minutes + 1;

  return true;
end;
$$;

revoke execute on function charge_recall_minute(uuid) from anon, authenticated;

comment on function charge_recall_minute is
  'Cobra un minuto del plan por cada aviso programado que sale. Devuelve false '
  'cuando no queda sitio, y entonces el aviso espera en vez de enviarse.';

-- ── Y LO QUE EL ADD-ON DE WHATSAPP DICE QUE ES ──────────────────────────────
-- Decía "Confirmações e recordatórios automáticos", que era verdad cuando las
-- confirmaciones sólo existían si se pagaba por ellas. Desde hoy van incluidas
-- en todos los planes, así que esa frase vende por 49 € algo que la clínica ya
-- tiene, y calla lo único que el add-on hace de verdad: que la Telma atienda en
-- WhatsApp igual que atiende al teléfono.
--
-- Es la frase que lee quien está con el dedo encima del botón de comprar, así
-- que importa más que la de la landing.
update addons
   set name = 'Telma no WhatsApp',
       description = 'A Telma atende também no WhatsApp: o paciente escreve e ela marca, '
                     'remarca e desmarca. As confirmações já vão incluídas no plano; com '
                     'o add-on chegam por WhatsApp. Até 1000 mensagens/mês'
 where id = 'whatsapp';
