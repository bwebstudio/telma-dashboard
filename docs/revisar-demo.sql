-- Por qué el panel de la demo no muestra nada
--
-- Ejecutar en el editor SQL del proyecto de la demo y mandarme lo que salga.
-- Son cuatro preguntas y ninguna cambia nada.

-- 1. ¿Qué migraciones están aplicadas? Si falta alguna de estas, ahí está la
--    respuesta: la aplicación pide cosas que la base todavía no tiene.
select
  to_regclass('public.resources')   is not null as tiene_agendas_0034,
  to_regclass('public.erasures')    is not null as tiene_borrados_0040,
  exists (select 1 from information_schema.columns
           where table_name='clinics' and column_name='service_prices') as tiene_precios_0037,
  exists (select 1 from information_schema.columns
           where table_name='calls' and column_name='transcript')       as columna_vieja_0041,
  exists (select 1 from pg_proc where proname='purge_expired')          as tiene_borrado_0039;

-- 2. ¿Hay datos de verdad, o están vacías las tablas?
select c.name,
       (select count(*) from calls        x where x.clinic_id=c.id) as llamadas,
       (select count(*) from appointments x where x.clinic_id=c.id) as citas,
       (select count(*) from resources    x where x.clinic_id=c.id) as agendas,
       c.status
  from clinics c
 order by c.created_at;

-- 3. ¿Se ha ejecutado el borrado automático alguna vez, y qué se llevó?
select * from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname='telma-purge')
 order by start_time desc limit 5;

-- 4. Lo más probable si el panel está lento: cuántas filas de horario tiene
--    cada clínica. Si alguna pasa de veinte, las migraciones 0035 y 0038 no
--    se aplicaron y la agenda está generando cientos de horas por día.
select c.name, count(s.*) as filas_de_horario
  from clinics c left join availability_slots s on s.clinic_id=c.id
 group by c.name order by 2 desc;
