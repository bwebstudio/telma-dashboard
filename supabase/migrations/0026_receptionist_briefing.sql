-- Training the receptionist.
--
-- Everything Telma needs to know about a clinic that is not a schedule and not
-- a service list. Until now the sign-up collected what the diary needed and
-- nothing about how to behave on the phone, so the agent had a calendar and no
-- manners: it could book an hour but could not say where the clinic is, whether
-- to address somebody formally, what a cleaning costs, or what to do when it
-- cannot help.
--
-- These columns are the variables half of the prompt. The other half — the
-- personality, the courtesies, the shape of a conversation — is ours and lives
-- in lib/onboarding/prompt.ts, versioned with the application. A clinic fills
-- in the variables; it does not write the character.

-- Where it is ------------------------------------------------------------------
-- `address` already exists from 0001 and was never asked for by the sign-up.
-- It is the single most common question a receptionist answers and the wizard
-- was not collecting it.

-- What things cost -------------------------------------------------------------
-- Optional and free text, deliberately. Some clinics quote prices on the phone
-- and some refuse on principle, and the ones that do quote have a structure
-- nobody else's fits: per treatment, from-prices, first consultation free.
-- Trying to model that as rows would produce a form nobody finishes, and the
-- agent reads it as prose either way. Null means "do not discuss prices", which
-- is a different instruction from an empty string and the prompt says so.
alter table clinics add column if not exists price_info text;

comment on column clinics.price_info is
  'What the clinic is willing to say about prices, in its own words. Null means Telma does not discuss prices at all.';

-- How to speak to people --------------------------------------------------------
-- 'formal' is usted / o senhor, 'informal' is tú / você. Not a stylistic
-- preference: a dental clinic in Porto and an aesthetic clinic in Barcelona
-- differ on this, and getting it wrong is the first thing a patient notices.
alter table clinics add column if not exists formality text not null default 'formal'
  check (formality in ('formal', 'informal'));

-- What to do when Telma cannot help ---------------------------------------------
-- Three honest options, and the clinic picks one. 'transfer' needs a number to
-- transfer to; the others need nothing.
alter table clinics add column if not exists fallback_policy text not null default 'message'
  check (fallback_policy in ('transfer', 'message', 'callback'));
alter table clinics add column if not exists fallback_number text;

comment on column clinics.fallback_policy is
  'transfer: put the caller through to fallback_number. message: take a message. callback: promise somebody will ring back.';

-- Anything else -----------------------------------------------------------------
-- The free text field that catches what no form anticipated: parking, which
-- insurers are accepted, the entrance being round the back, the fact that the
-- dentist is away on Thursdays. Read into the prompt verbatim.
alter table clinics add column if not exists briefing text;

comment on column clinics.briefing is
  'Free text from the sign-up: anything the clinic wants Telma to know that no other field covers. Goes into the prompt as written.';

-- The base language stops being compulsory ---------------------------------------
-- 0025 forced every clinic to keep the language of its country, on the grounds
-- that a clinic should always speak the local language. That is an assumption,
-- and it is the clinic's to make: an international practice in Lisbon whose
-- patients are British does not want Portuguese taking one of its two slots.
--
-- What survives is the part that is actually a rule: at least one language, all
-- of them real, no more than the plan includes.
create or replace function public.validate_clinic_languages()
returns trigger language plpgsql as $$
declare
  v_max     smallint;
  v_unknown text;
begin
  if new.selected_languages is null or cardinality(new.selected_languages) = 0 then
    raise exception 'A clinic must speak at least one language'
      using errcode = 'check_violation';
  end if;

  select code into v_unknown
    from unnest(new.selected_languages) as code
   where code not in (select l.code from available_languages l where l.status = 'available')
   limit 1;

  if v_unknown is not null then
    raise exception 'Language "%" is not available', v_unknown
      using errcode = 'check_violation';
  end if;

  select p.max_languages_included into v_max
    from plans p where p.id = new.plan::text;

  if v_max is not null and cardinality(new.selected_languages) > v_max then
    raise exception 'Plan % includes % language(s); % were selected',
      new.plan, v_max, cardinality(new.selected_languages)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- `clinics.language` was the base language, and there is no base language any
-- more. It stays as the one Telma opens in when a caller has not said anything
-- yet, which is a real thing an agent needs and a much smaller claim.
comment on column clinics.language is
  'The language Telma greets in, before the caller has said anything. Must be one of selected_languages.';
