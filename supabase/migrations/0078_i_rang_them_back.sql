-- "Já liguei de volta", on a call where there was nobody to open a record for.
--
-- ── WHY IT IS NOT A NOTE ON A RECORD ───────────────────────────────────────
-- Everything a clinic does about a person is written on that person's record:
-- the attempts, whether they got through, whether it is dealt with, the notes.
-- That works because the record is a person, and a person has a name.
--
-- A call where somebody hung up while it rang has no person. Nobody spoke, so
-- there is no name, and a record opened on a bare number would be a row in the
-- patients list that nobody can read and nobody will ever name. Those records
-- have to survive the day this clinic lets Telma book, and become the ones her
-- bookings attach to, so a list half full of telephone numbers is not a
-- shortcut, it is a mess with a long life.
--
-- But the work is real and it is exactly what the first client asked for:
-- "se não atendeu, haver a possibilidade de colocar quando é que a assistente
-- retomou novamente a chamada, pode haver várias opções para isto, pois pode
-- ligar de volta mais de 2 vezes". So it is written on the call, which is the
-- only thing that exists at that point.
--
-- And it stays small on purpose: how many times, and the last one. The moment
-- somebody answers, the clinic learns the name, opens the record, and from
-- then on everything about that person is in one place -- including this call,
-- which attaches to the record by the number it came from.
alter table calls
  add column if not exists callbacks smallint not null default 0,
  add column if not exists called_back_at timestamptz;

comment on column calls.callbacks is
  'How many times the clinic rang this number back. Only ever used on a call nobody answered: once there is a person, the attempts live on their record.';
comment on column calls.called_back_at is
  'The last of those attempts.';
