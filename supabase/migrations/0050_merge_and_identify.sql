-- Two records, one person, and the third thing that tells people apart.
--
-- 0049 fixed a household sharing a handset. It leaves the opposite error
-- standing, and that one has no fix in the data itself: somebody who rings from
-- their mobile on Monday and from the house telephone on Thursday is two
-- records, with their history split down the middle and nothing on any screen
-- saying the two are the same person.
--
-- Telephone plus name cannot close that. The clinic software we are integrating
-- with does not try: it carries a patient number and a NIF precisely because a
-- contact number is not an identity. So this adds the two things that do close
-- it, and they are a pair.
--
-- ── THE NIF, WHICH THE CLINIC ASKS FOR AND TELMA NEVER DOES ─────────────────
-- Optional, typed at the desk by somebody with the person in front of them. It
-- is not a question for a voice on a telephone: asking a stranger for a tax
-- number to book a cleaning is not what a receptionist does, and their own
-- documentation has the rule we already apply to the name — "é o utente que o
-- fornece, não o contrário".
--
-- What it is for is this file's other half: two records with the same NIF are
-- the same person, said by the clinic rather than guessed by us.
--
-- ── AND MERGING, WHICH MUST NOT LOSE THE NUMBER IT WAS SPLIT BY ────────────
-- The naive merge throws away the losing record and with it the telephone that
-- caused the split, so the next call from that number opens a third record and
-- the clinic does the same work again in a fortnight. So the numbers are kept:
-- `other_digits` carries every other number this person has rung from, and
-- `remember_patient` looks there too.

alter table patients add column if not exists tax_id text;

-- Uppercased and stripped of everything that is not a letter or a digit, so
-- "PT 123 456 789" and "pt123456789" compare equal. Letters are kept: a Spanish
-- DNI ends in one, and dropping it would make 12345678Z and 12345678X the same
-- person.
alter table patients
  add column if not exists tax_key text
  generated always as (upper(regexp_replace(coalesce(tax_id, ''), '[^A-Za-z0-9]', '', 'g'))) stored;

create index if not exists idx_patients_clinic_tax
  on patients (clinic_id, tax_key) where tax_key <> '';

-- Every other number this person has rung from, already cut to the last nine
-- digits, because that is how every comparison in this schema is made and an
-- array of raw strings would need normalising at every read.
alter table patients
  add column if not exists other_digits text[] not null default '{}'::text[];

create index if not exists idx_patients_other_digits on patients using gin (other_digits);

comment on column patients.tax_id is
  'Optional, and never asked for by Telma: a receptionist types it with the '
  'person in front of them. Its purpose is to say that two records are one '
  'person, which no telephone number can.';

/**
 * Remember whoever just gave their name and number.
 *
 * Four steps now, in order of confidence. The new one is the second: a number
 * this person has rung from before, kept when two records were merged. Without
 * it a merge lasts exactly until the next call from the other telephone.
 */
create or replace function remember_patient(
  p_clinic_id uuid,
  p_name text,
  p_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_key    text := lower(v_name);
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 9);
  v_found  text;
begin
  if length(v_digits) < 9 or v_name = '' then
    return null;
  end if;

  -- 1. The same person, said the same way, on their main number.
  update patients
     set last_seen_at = now()
   where clinic_id = p_clinic_id and phone_digits = v_digits and name_key = v_key
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- 2. The same name on a number this person has rung from before. Exact only:
  --    a second number is weaker evidence than a first, and a household shares
  --    those too.
  update patients
     set last_seen_at = now()
   where clinic_id = p_clinic_id
     and other_digits @> array[v_digits]
     and name_key = v_key
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- 3. The same person, said with more or less of their name. The longer one
  --    wins: it is the one the clinic heard and agreed to most recently.
  select id, name_key into v_id, v_found
    from patients
   where clinic_id = p_clinic_id
     and phone_digits = v_digits
     and (name_key like v_key || ' %' or v_key like name_key || ' %')
   order by length(name_key) desc
   limit 1;
  if v_id is not null then
    update patients
       set name = case when length(v_key) > length(v_found) then v_name else name end,
           last_seen_at = now()
     where id = v_id;
    return v_id;
  end if;

  -- 4. Somebody this clinic has not heard from on this number.
  insert into patients (clinic_id, name, phone)
  values (p_clinic_id, v_name, p_phone)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function remember_patient(uuid, text, text) from anon, authenticated;

/**
 * Two records into one, decided by a person who knows they are one person.
 *
 * ── WHAT SURVIVES, AND WHY EACH ONE ────────────────────────────────────────
 * Everything that would otherwise be lost silently, which is the only kind of
 * loss worth writing code about:
 *
 *   the bookings and the reminders  re-pointed, never deleted
 *   the other record's number       into other_digits, or the merge undoes
 *                                   itself on the next call from it
 *   both notes                      joined, because a note somebody typed is
 *                                   not ours to drop
 *   the NIF                         whichever one is set
 *   first seen                      the earlier of the two
 *
 * ── AND THE TWO PERMISSIONS GO THE SAFE WAY, WHICH IS NOT THE SAME WAY ─────
 * An opt-out on either record wins: somebody who has said "stop writing to me"
 * has said it about themselves, and a merge is not a reason to ask them again.
 *
 * A marketing consent on either record also carries, with its own date and
 * source. That looks like the opposite rule and it is the same one: both are
 * things the person said, and a merge must not silently discard either. What it
 * must never do is invent one, and it does not — no consent on either side
 * means no consent after.
 */
create or replace function merge_patients(
  p_clinic_id uuid,
  p_keep uuid,
  p_drop uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_keep patients;
  v_drop patients;
  v_appts integer := 0;
  v_recalls integer := 0;
begin
  if p_keep = p_drop then
    raise exception 'same_record' using errcode = 'P0001';
  end if;

  -- Both, and both of this clinic. This function runs past every policy, so
  -- this is the line that stops one clinic merging another's records.
  select * into v_keep from patients where id = p_keep and clinic_id = p_clinic_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_drop from patients where id = p_drop and clinic_id = p_clinic_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  update appointments set patient_id = p_keep where patient_id = p_drop;
  get diagnostics v_appts = row_count;

  update patient_recalls set patient_id = p_keep where patient_id = p_drop;
  get diagnostics v_recalls = row_count;

  update patients set
    other_digits = (
      select coalesce(array_agg(distinct d), '{}'::text[])
        from unnest(
          v_keep.other_digits || v_drop.other_digits || array[v_drop.phone_digits]
        ) as d
       where d is not null and d <> '' and d <> v_keep.phone_digits
    ),
    notes = case
      when coalesce(btrim(v_drop.notes), '') = '' then v_keep.notes
      when coalesce(btrim(v_keep.notes), '') = '' then v_drop.notes
      else v_keep.notes || E'\n' || v_drop.notes
    end,
    tax_id = coalesce(nullif(btrim(v_keep.tax_id), ''), v_drop.tax_id),
    created_at = least(v_keep.created_at, v_drop.created_at),
    last_seen_at = greatest(v_keep.last_seen_at, v_drop.last_seen_at),
    -- A no on either side is a no.
    reminders_opt_out_at = coalesce(v_keep.reminders_opt_out_at, v_drop.reminders_opt_out_at),
    -- A yes on either side is a yes, with the source that proves it.
    marketing_consent_at = coalesce(v_keep.marketing_consent_at, v_drop.marketing_consent_at),
    marketing_consent_source = coalesce(
      nullif(btrim(v_keep.marketing_consent_source), ''),
      v_drop.marketing_consent_source
    )
  where id = p_keep;

  delete from patients where id = p_drop;

  return jsonb_build_object(
    'appointments_moved', v_appts,
    'recalls_moved', v_recalls,
    'phone_kept', v_drop.phone_digits
  );
end;
$$;

revoke execute on function merge_patients(uuid, uuid, uuid) from anon, authenticated;

-- ── AND ERASURE HAS TO REACH THE OTHER NUMBERS TOO ──────────────────────────
-- It matches on the last nine digits of one number. A merged record's second
-- number would find nothing, so somebody who asked to be forgotten and gave the
-- number they usually ring from would be told there was nothing to erase.
create or replace function erase_patient(
  p_clinic_id uuid,
  p_phone     text,
  p_reference text default null,
  p_actor     uuid default null
) returns jsonb language plpgsql as $$
declare
  v_digits text := right(phone_digits(p_phone), 9);
  v_names  text[];
  v_appts  integer := 0;
  v_calls  integer := 0;
  v_log    integer := 0;
  v_recs   integer := 0;
  v_id     uuid;
begin
  if v_digits = '' then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  select array_agg(distinct a.patient_name) into v_names
    from appointments a
   where a.clinic_id = p_clinic_id
     and right(phone_digits(a.patient_phone), 9) = v_digits;

  update appointments a
     set patient_name = 'Apagado a pedido',
         patient_phone = '',
         summary = null
   where a.clinic_id = p_clinic_id
     and right(phone_digits(a.patient_phone), 9) = v_digits;
  get diagnostics v_appts = row_count;

  update calls c
     set from_phone = null,
         summary = null,
         recording_url = null
   where c.clinic_id = p_clinic_id
     and right(phone_digits(c.from_phone), 9) = v_digits;
  get diagnostics v_calls = row_count;

  select count(*) into v_recs
    from patient_recalls r
    join patients p on p.id = r.patient_id
   where r.clinic_id = p_clinic_id
     and (p.phone_digits = v_digits or p.other_digits @> array[v_digits]);

  delete from patients p
   where p.clinic_id = p_clinic_id
     and (p.phone_digits = v_digits or p.other_digits @> array[v_digits]);

  if v_names is not null then
    delete from activity_log l
     where l.clinic_id = p_clinic_id
       and exists (
         select 1 from unnest(v_names) n
          where n is not null and n <> '' and l.message ilike '%' || n || '%'
       );
    get diagnostics v_log = row_count;
  end if;

  insert into erasures (clinic_id, reference, appointments_anonymised, calls_redacted, activity_deleted, performed_by)
  values (p_clinic_id, p_reference, v_appts, v_calls, v_log, p_actor)
  returning id into v_id;

  return jsonb_build_object(
    'erasure_id', v_id,
    'appointments_anonymised', v_appts,
    'calls_redacted', v_calls,
    'activity_deleted', v_log,
    'recalls_cancelled', v_recs
  );
end $$;

revoke execute on function erase_patient(uuid, text, text, uuid) from anon;
