-- Which version of which document each clinic agreed to, and when.
--
-- ── WHAT WAS THERE BEFORE ──────────────────────────────────────────────────
-- A checkbox. The sign-up required `terms: true`, the schema refused to
-- continue without it, and then the answer was thrown away: no column, no
-- timestamp, no version. The clinic row could not say whether anybody had
-- agreed to anything, let alone to what.
--
-- That holds up for exactly as long as the documents never change. The first
-- time the terms are rewritten -- which is about to happen, since the ones
-- published today say of themselves that they are provisional -- every clinic
-- on the system becomes a clinic nobody can prove accepted anything.
--
-- ── THE VERSION IS NOT 1.0 ─────────────────────────────────────────────────
-- Deliberately. The documents a clinic accepts today are the placeholders, the
-- ones that read "contenido provisional, a revisar antes de publicar". Writing
-- "1.0" against them would record a lie that is impossible to spot later.
--
-- So today's version is marked provisional. When the real documents are
-- published the constants move to 1.0, and the clinics that have to be asked
-- again are exactly the rows that still say otherwise. One query, and nobody
-- has to remember who signed up in which week.
alter table public.clinics
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.clinics.terms_version is
  'The terms the clinic accepted at sign-up. See TERMS_VERSION in lib/legal.ts.';
comment on column public.clinics.privacy_version is
  'The privacy policy accepted at sign-up. See PRIVACY_VERSION in lib/legal.ts.';
comment on column public.clinics.terms_accepted_at is
  'When the box was ticked. Not the row''s creation time: a clinic created by hand has no acceptance.';

-- The clinics that signed up before any of this was recorded. Their acceptance
-- happened and cannot be reconstructed, which is itself the fact worth keeping:
-- null means "we do not know", and null is the honest answer.
