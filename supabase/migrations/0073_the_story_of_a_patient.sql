-- Opening and closing a follow-up are things that happened, so they are
-- entries like everything else.
--
-- The record was a set of boxes: the follow-up in one, the notes in another,
-- the calls in a third, the bookings in a fourth. Somebody at the desk opening
-- it tomorrow does not want four boxes, they want one answer to "what has been
-- going on with this person", in order. That answer is a chronology, and a
-- chronology cannot be built out of a timestamp on a column: "open since the
-- 3rd" says when the current one started and nothing about the one before it.
--
-- So the two decisions join the log. `patient_notes` was already the table of
-- things that happened to a person; it simply had two kinds and now has four.
alter table public.patient_notes
  drop constraint if exists patient_notes_kind_check;

alter table public.patient_notes
  add constraint patient_notes_kind_check
  check (kind in ('nota', 'contacto', 'abertura', 'fecho'));

comment on column public.patient_notes.kind is
  'nota: something the clinic wrote. contacto: an attempt to reach them, with reached. abertura and fecho: a follow-up opened and closed.';
