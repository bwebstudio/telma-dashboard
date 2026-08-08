-- Telling the voice apart from the agent that speaks it.
--
-- `voice_agent_id` (0001) has been carrying two different things depending on
-- who wrote the row. The demo seed puts an agent id in it (`agent_sorriso_01`),
-- the sign-up was putting an ElevenLabs voice id in it, and the voice platform
-- reading `/api/clinic-context` cannot tell which it got.
--
-- They are not the same thing and the difference is operational. The agent is
-- the thing that answers: one per language, shared by every clinic on that
-- language, holding the prompt and the tools. The voice is what that agent
-- sounds like for this particular clinic, and it is the only half the clinic
-- chooses. Two clinics can share an agent and sound different; a clinic can
-- change its voice without anything about the agent moving.
--
-- So `voice_agent_id` goes back to meaning only the agent, and the voice gets
-- its own column. `voice_name` stays as it was: the human readable label, for
-- the panel and the internal list, which should never have to resolve an id
-- against an API to draw a row.
alter table clinics add column if not exists voice_id text;

comment on column clinics.voice_id is
  'ElevenLabs voice id chosen at sign-up. What the shared agent in voice_agent_id sounds like for this clinic.';

comment on column clinics.voice_agent_id is
  'ElevenLabs agent id. Shared per language, not per clinic. The voice lives in voice_id.';

-- Rows written by the sign-up before this migration have a voice id sitting in
-- `voice_agent_id`. Move it across rather than leaving it to be read as an
-- agent, and blank the column so the clinic shows up as needing an agent
-- assigned instead of silently pointing at nothing.
--
-- The guard is the shape of the two ids: an ElevenLabs agent id starts with
-- `agent_`, a voice id does not. Anything already shaped like an agent is left
-- exactly where it is.
update clinics
   set voice_id = voice_agent_id,
       voice_agent_id = null
 where voice_agent_id is not null
   and voice_id is null
   and voice_agent_id not like 'agent_%';
