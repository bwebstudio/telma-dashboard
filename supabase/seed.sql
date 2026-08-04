-- Optional demo data. Safe to skip in production.
-- Creates one demo clinic with a default week of hours and a little history,
-- so the internal panel is not empty on first boot. It does NOT create users
-- (those come from Supabase Auth, see the README).

insert into clinics (id, name, address, phone, contact_email, plan, addon_whatsapp, status, minute_limit, assigned_phone, voice_agent_id, voice_name)
values (
  '11111111-1111-1111-1111-111111111111',
  'Clínica Dentária Sorriso',
  'Rua das Flores 12, Porto',
  '+351 220 000 000',
  'geral@sorriso.pt',
  'clinica', true, 'ativa', 750,
  '+351 300 500 900', 'agent_sorriso_01', 'Telma PT'
) on conflict (id) do nothing;

-- Monday to Friday, 09:00 to 12:00 and 14:00 to 17:00.
insert into availability_slots (clinic_id, weekday, start_time, end_time)
select '11111111-1111-1111-1111-111111111111', wd, make_time(h, 0, 0), make_time(h + 1, 0, 0)
from generate_series(1, 5) as wd,
     unnest(array[9, 10, 11, 14, 15, 16]) as h
on conflict do nothing;

insert into calls (clinic_id, from_phone, duration_seconds, result, summary)
values
  ('11111111-1111-1111-1111-111111111111', '+351 912 345 678', 95, 'marcacao', 'A Telma marcou uma limpeza para a paciente Ana.'),
  ('11111111-1111-1111-1111-111111111111', '+351 933 111 222', 40, 'informacao', 'A Telma respondeu sobre o horario e a morada da clinica.'),
  ('11111111-1111-1111-1111-111111111111', '+351 966 777 888', 130, 'transferida', 'Urgencia, a Telma passou a chamada para a rececao.');

insert into appointments (clinic_id, patient_name, patient_phone, reason, scheduled_at, status, origin, summary)
values (
  '11111111-1111-1111-1111-111111111111',
  'Ana Martins', '+351 912 345 678', 'Limpeza',
  (date_trunc('day', now()) + interval '2 days' + interval '10 hours'),
  'pendente', 'telefone', 'A Telma marcou uma limpeza. A paciente prefere de manha.'
);

insert into usage (clinic_id, month, calls_count, minutes)
values ('11111111-1111-1111-1111-111111111111', date_trunc('month', now())::date, 3, 4.5)
on conflict (clinic_id, month) do nothing;

insert into activity_log (clinic_id, type, message)
values ('11111111-1111-1111-1111-111111111111', 'clinic_created', 'Clinica de demonstracao criada');
