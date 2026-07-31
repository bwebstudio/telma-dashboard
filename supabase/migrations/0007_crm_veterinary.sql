-- Veterinary clinics are a target segment too: they take bookings by phone all
-- day and lose the calls they cannot answer, exactly like a dental practice.
--
-- On its own like the role migration, because Postgres refuses to use a
-- freshly added enum value inside the transaction that added it.

alter type crm_specialty add value if not exists 'veterinary';
