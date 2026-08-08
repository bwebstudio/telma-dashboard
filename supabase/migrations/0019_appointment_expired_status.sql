-- A pre-marcação nobody answered in time.
--
-- 'rejeitada' is the clinic saying no. 'cancelada' is a booking that existed and
-- was called off. 'expirada' is neither: nobody decided anything, the window
-- closed, and the hour went back on sale. Telling them apart matters the first
-- time a patient rings to ask why their appointment vanished.
--
-- Alone in its own migration on purpose: Postgres refuses to use an enum value
-- in the same transaction that created it, which 0020 does.
alter type appointment_status add value if not exists 'expirada';
