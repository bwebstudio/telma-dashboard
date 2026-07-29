-- New internal role for the sales CRM.
-- Kept in its own migration: Postgres refuses to use a freshly added enum
-- value inside the same transaction that added it.

alter type user_role add value if not exists 'comercial';
