-- A telephone is not a person, and one number is often a household.
--
-- 0046 keyed the patient record on (clinic, last nine digits) and said, in as
-- many words, that two clinics sharing a patient hold two rows. That part was
-- right. What it missed is the other direction: two people sharing a telephone
-- held one row, and the upsert wrote the second person's name over the first.
--
--   Ana rings from 910 523 903 and a record opens.
--   Her husband João rings from the same handset.
--   Ana's record is now called João, with Ana's bookings under it.
--
-- Not a duplicate, not a merge anybody chose: a silent rename that takes one
-- person's history and files it under another's name. It showed up in the demo
-- as fourteen names collapsing into one record and was written off as a
-- limitation of the demo, which it was not.
--
-- ── WHAT THE MODEL SHOULD HAVE BEEN ─────────────────────────────────────────
-- The clinic software this is going to integrate with has had the answer all
-- along, in a field called `matchCount`: a number can belong to more than one
-- person, and the way through it is to ask which one. Their own documentation
-- spells out the case — "família a partilhar telemóvel" — and returns the list
-- rather than guessing.
--
-- So the key becomes (clinic, digits, name). Several people to a number, told
-- apart by what they say their name is, which is the same thing a receptionist
-- does and the only thing available over a telephone.
--
-- ── SPLITTING IS THE SAFE DIRECTION, AND IT IS THE ONE WE TAKE ──────────────
-- The new key has its own failure: somebody who says "Ana" one week and "Ana
-- Martins" the next gets two records. That is the error to prefer. A split
-- record costs Telma one question and shows the clinic two cards on the same
-- number, both visible, both fixable. A merged record tells the clinic that
-- João has been five times when it was Ana, and nothing on any screen says so.
--
-- Halved anyway by the prefix rule below: "ana" and "ana martins" on the same
-- number are treated as the same person and the longer name wins, because the
-- clinic agreed to the longer one more recently.
--
-- ── WHAT THIS DOES NOT CHANGE ───────────────────────────────────────────────
-- Telma still never says a name she has on file. The number saves her asking
-- for the number; it does not save her asking who is speaking, and with a
-- household on one handset that question is the whole point. Reading two first
-- names out to whoever picked up would be telling a stranger who lives there.

-- The name as a key: lowercase, single-spaced, trimmed. Accents are kept,
-- because the same speech model transcribes both calls and writes "Hélder" both
-- times; stripping them would need an extension this database does not have and
-- would buy almost nothing.
alter table patients
  add column if not exists name_key text
  generated always as (lower(btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')))) stored;

drop index if exists idx_patients_clinic_phone;

create unique index if not exists idx_patients_clinic_phone_name
  on patients (clinic_id, phone_digits, name_key)
  where phone_digits <> '';

/**
 * Remember whoever just gave their name and number.
 *
 * Called when a booking is filed, which is the only moment both are known and
 * confirmed out loud.
 *
 * Three steps, in order of confidence: the same name on the same number, then a
 * name that is one of those with more or less of it, then somebody new. The
 * middle step is what stops "Ana" and "Ana Martins" becoming two people; the
 * third is what stops Ana becoming João.
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
  -- Nine digits or nothing. A partial number would collide with other partial
  -- numbers and quietly merge two people into one record.
  if length(v_digits) < 9 or v_name = '' then
    return null;
  end if;

  -- 1. The same person, said the same way.
  update patients
     set last_seen_at = now()
   where clinic_id = p_clinic_id and phone_digits = v_digits and name_key = v_key
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- 2. The same person, said with more or less of their name. The longer one
  --    wins: it is the one the clinic heard and agreed to most recently, and it
  --    is the one that tells two people in a household apart.
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

  -- 3. Somebody this clinic has not heard from on this number.
  insert into patients (clinic_id, name, phone)
  values (p_clinic_id, v_name, p_phone)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function remember_patient(uuid, text, text) from anon, authenticated;

comment on table patients is
  'One row per person per clinic, keyed by number AND name: a household shares a '
  'handset, and keying on the number alone renamed one person''s record after '
  'another. Erasure empties it; the appointments keep their own copy.';
