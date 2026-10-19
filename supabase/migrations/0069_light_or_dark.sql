-- Light or dark, chosen by the clinic.
--
-- It replaces the accent colour in the panel, which asked a clinic to pick a
-- hue for the washes behind a hovered row and a selected day: a real choice,
-- and not the one anybody was asking for. A receptionist reading this screen
-- a hundred times a day in a room with the blinds down wants the lights off,
-- not a different lilac.
--
-- The accent column stays and keeps working. Clinics have values in it, the
-- CSS still reads them, and a rename would be a migration for no gain; what
-- changes is which of the two the panel offers.
--
-- Stored on the clinic and not on the person, because that is where the rest
-- of the panel's appearance already lives, and because a clinic is usually
-- one desk and one screen.
alter table public.clinics
  add column if not exists theme text not null default 'light'
  check (theme in ('light', 'dark'));

comment on column public.clinics.theme is
  'Light or dark panel. Read by the shell into [data-theme]; see app/globals.css.';
