-- Where a clinic actually is.
--
-- Sonia works Barcelona on foot: her other job already has her moving between
-- shops all day, so she will knock on a door far more often than she will dial.
-- A list ordered by "next call" is the wrong shape for that. A map is the right
-- one, and a map needs coordinates, not a postal address.
--
-- Nullable on purpose: a clinic a rep types in from the street has no
-- coordinates until somebody geocodes it, and it must still be saveable in the
-- ten seconds that matters.

alter table crm_prospects
  add column if not exists lat double precision,
  add column if not exists lon double precision;

-- The map always asks the same question: everything with a position, for this
-- rep. Partial, because most of the table may never carry coordinates.
create index if not exists idx_crm_prospects_geo
  on crm_prospects (rep_id, lat, lon)
  where lat is not null and lon is not null;

comment on column crm_prospects.lat is
  'WGS84 latitude. Null when the address has not been geocoded.';
comment on column crm_prospects.lon is
  'WGS84 longitude. Null when the address has not been geocoded.';
