-- What Telma does when somebody is in pain.
--
-- The landing promises it in writing: "em urgência, ou se o paciente pedir, a
-- Telma passa a chamada para uma pessoa real". Nothing in the schema carried
-- that, so nothing in the prompt could say it.
--
-- It is not `fallback_policy` under another name. That one covers "I do not
-- know the answer" and its right instinct is to take a message. This covers
-- somebody bleeding after an extraction, and its right instinct is to interrupt
-- whatever else is happening and reach a person. Taking a message from the
-- first is service; taking a message from the second is negligence.

-- Where an emergency goes -------------------------------------------------------
-- Nullable, and the prompt handles null rather than inventing a number: a clinic
-- that never named one gets an instruction to send the caller to an emergency
-- service, which is worse than a direct line and much better than a guess.
alter table clinics add column if not exists emergency_number text;

comment on column clinics.emergency_number is
  'Where Telma escalates an emergency. Inside opening hours she transfers to it; outside, she reads it out as the number to ring now.';

-- What the clinic wants said ----------------------------------------------------
-- Free text, because the answer differs for a dental practice, an aesthetic
-- clinic and a veterinary hospital, and because the out-of-hours instruction is
-- exactly the kind of thing specific to one clinic's arrangement with one
-- on-call service.
alter table clinics add column if not exists emergency_protocol text;

comment on column clinics.emergency_protocol is
  'The clinic''s own words for what to do in an emergency. Read into the prompt verbatim, under the rules, never over them.';

-- Whether the call is recorded --------------------------------------------------
-- True for every clinic today, because the panel stores the audio of every call
-- and plays it back in the conversations screen. A column and not a constant so
-- a clinic that opts out can, and so the prompt's opening line is driven by what
-- is true rather than by an assumption.
--
-- The default is the important part. Recording a call in the EU without telling
-- the other party is a GDPR problem, and the product sells "RGPD e dados
-- alojados na UE" as an argument, so the notice is on unless somebody
-- deliberately turns the recording off.
alter table clinics add column if not exists calls_recorded boolean not null default true;

comment on column clinics.calls_recorded is
  'Whether call audio is stored. When true, Telma announces the recording in her opening line, which is what makes it lawful.';
