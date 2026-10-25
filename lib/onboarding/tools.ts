/**
 * Which tools exist on the hand of the agent, for this one call.
 *
 * ── WHY A LIST OF IDS LIVES IN THE REPOSITORY ──────────────────────────────
 * One shared agent answers for every clinic, so it carries every tool any
 * clinic could need: the four that talk to a diary, the one that files the
 * call, and the one that puts a call through. A clinic without a diary needs
 * exactly one of those six, and the sheet says so in as many words ("the only
 * tool you use is telma_registar_chamada").
 *
 * Prose was not enough. Three times on a real call, with that sentence in the
 * prompt, somebody said "I want to cancel" and the model said "let me just
 * check that" and reached for telma_ver_marcacoes with a telephone number it
 * had invented. The server refused, correctly, but the caller had already been
 * promised a check that was never going to happen, and the call went sideways
 * from there. A tool on the agent's hand is an affordance; a sentence telling
 * it not to use the tool is a wish.
 *
 * So the tool is taken off the hand instead. ElevenLabs allows the per-call
 * override `conversation_config_override.agent.prompt.tool_ids`, which replaces
 * the agent's list for that conversation only, and /api/voice/init is already
 * the place where one agent becomes this clinic's receptionist.
 *
 * It has to be ids, not names: that is what the platform's override takes. And
 * the ids cannot come from the environment, because they are not a secret and
 * because a missing variable would silently mean "no override" -- the bug we
 * are fixing -- rather than a visible failure. They live here, named, next to
 * the reason they exist. `scripts/elevenlabs-wire-tools.mjs` is what creates
 * the tools; if it is ever made to recreate one, the new id goes here.
 *
 * ── THE ONE THING THAT MUST NOT HAPPEN ─────────────────────────────────────
 * An empty list, or a list without `registar_chamada`. The current bug makes a
 * call go badly; a call where Telma cannot file anything leaves the clinic with
 * no record that the telephone rang at all, which is worse. So the filing tool
 * is not conditional on anything, and `toolsForCall` is written to always
 * return it.
 *
 * The system tools (`end_call`, `skip_turn`) are a different field on the
 * platform (`built_in_tools`) and are untouched by this.
 */

/**
 * The agent these ids belong to. A tool id is only meaningful on its own
 * agent, so an override built from this list must not be sent to another one:
 * the throwaway Spanish agent in `scripts/spanish-demo-agent.mjs` has copies of
 * all six under different ids.
 */
export const TELMA_AGENT_ID = 'agent_9701kzp690x6fnaba03rmp81kt9a'

/** Every tool on that agent, by the name the prompt calls it. */
export const TELMA_TOOL_IDS = {
  horas_livres: 'tool_6701kzp6904wemhtcakyhcj2y7kb',
  reservar_hora: 'tool_1701kzp690abegpvsdqqdthbperf',
  ver_marcacoes: 'tool_8601kzp690f3fcgtwn2338fm721g',
  cancelar_marcacao: 'tool_3401kzp690kyem0vp0gdrt6b0gy7',
  registar_chamada: 'tool_5301kzp690rye3kbgkk7kk17v6rn',
  passar_chamada: 'tool_5701m55reyxqf9vb8mrwz7wbchdg',
} as const

interface CallShape {
  /** The agent that is answering, as the platform reports it. */
  agentId?: string | null
  /** Whether this clinic has a diary Telma may read and write. */
  takesBookings: boolean
  /** Whether there is anywhere to put a call through to. */
  canTransfer: boolean
}

/**
 * The tools this call may use, or null for "do not override".
 *
 * Null in two cases, both of them deliberately the old behaviour: an agent
 * whose ids we do not know, and a clinic that books. A clinic with a diary
 * needs all six, so sending the full list would only be a second copy of it
 * that could fall out of step with the agent.
 */
export function toolsForCall({ agentId, takesBookings, canTransfer }: CallShape): string[] | null {
  const id = agentId?.trim()
  if (id && id !== TELMA_AGENT_ID) return null
  if (takesBookings) return null

  // Filing is unconditional. See the note above.
  const tools: string[] = [TELMA_TOOL_IDS.registar_chamada]
  if (canTransfer) tools.push(TELMA_TOOL_IDS.passar_chamada)
  return tools
}
