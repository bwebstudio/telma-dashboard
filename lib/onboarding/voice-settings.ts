/**
 * How Telma sounds. One copy of it, read by everything that speaks.
 *
 * There were two: the agent's own settings in scripts/elevenlabs-wire-tools.mjs
 * and, separately, whatever ELEVENLABS_MODEL_ID happened to say in the
 * environment where the sign-up preview ran. They drifted, and the comment
 * beside the preview had already written down what that costs -- a clinic that
 * hears one voice in the sign-up and gets another on the line has been shown a
 * voice it will not have. By the time it was noticed the preview was on
 * turbo_v2_5 at stability 0.5 and the telephone was on v3 conversational at
 * 0.7 with expressive mode on. Three differences, none of them a decision.
 *
 * ── NO IMPORTS ─────────────────────────────────────────────────────────────
 * Deliberate, like lib/onboarding/prompt.ts: a plain .mjs script has to be able
 * to read this with nothing but node.
 */

export const AGENT_TTS = {
  /**
   * v3 conversational, chosen by listening against HeyGen. Turbo v2_5 was the
   * platform requirement when the agent was built and stopped being one.
   */
  model_id: 'eleven_v3_conversational',
  /** What v3 adds and turbo did not have. Without it the voice is flat again. */
  expressive_mode: true,
  /**
   * 0.7, and it has been to 0.8 and back.
   *
   * Higher is less accent drift, which v3's expressive mode has. But at 0.8 it
   * repeated a word on a real call -- "segunda-feira segunda-feira" -- and the
   * transcript proves the model wrote the day once, so the voice said it twice.
   * A repeated word is worse than a wandering accent when the word is the day
   * of the appointment.
   */
  stability: 0.7,
  similarity_boost: 0.75,
  /** 0 and not 3: aggressive chunking starts a new intonation per chunk, and
   *  that is what is heard as a machine voice. */
  optimize_streaming_latency: 0,
} as const
