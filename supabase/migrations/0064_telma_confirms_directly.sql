-- The clinic that does not want to confirm anything.
--
-- The product was built on one answer to a real question: who decides that a
-- booking is real? Telma takes it, leaves it 'pendente', and somebody in the
-- clinic says yes. That is the safe default and it is what the website sells.
--
-- It is not what every clinic wants. The first two asked for the opposite and
-- the reason is the same one that made them buy Telma: if a person has to
-- confirm every booking by hand, the telephone has been answered for them but
-- the work has not been taken away. For those clinics Telma books, confirms
-- and tells the patient, all inside the call.
--
-- Per clinic and not a rewrite, because the other answer is still the right
-- one for a clinic with somebody at the desk all day, and the website still
-- offers it.
--
-- ── WHAT THIS CHANGES BESIDES A STATUS ─────────────────────────────────────
-- What Telma says. She ends a booking with "fica por confirmar pela clínica"
-- and is told never to give a booking as guaranteed. With this on, that
-- sentence is false, and a patient told their appointment is provisional when
-- it is not has been misinformed by the one part of this product they
-- actually hear.
alter table public.clinics
  add column if not exists appointments_auto_confirmed boolean not null default false;

comment on column public.clinics.appointments_auto_confirmed is
  'Telma confirms the booking herself and tells the patient so, instead of leaving it pending for the clinic. Changes the prompt, the status written and whether an SMS goes out during the call.';
