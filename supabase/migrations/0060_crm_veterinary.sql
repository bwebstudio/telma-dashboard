-- Veterinary clinics are a target segment too: they take bookings by phone all
-- day and lose the calls they cannot answer, exactly like a dental practice.
--
-- On its own like the role migration, because Postgres refuses to use a
-- freshly added enum value inside the transaction that added it.
--
-- Numbered 0060 and not 0007. It was written as 0007, where 0007 was already
-- taken by 0007_crm_stage_no_regress, so the version was recorded as applied
-- and this file was never run by the tool: the label exists because somebody
-- added it by hand. Two files with one version also stop `supabase db push`
-- dead, which is how it was finally noticed. Re-running it costs nothing --
-- `add value if not exists` on a label that is already there is a no-op.

alter type crm_specialty add value if not exists 'veterinary';
