/**
 * Whether a call is recorded, and therefore whether Telma says so.
 *
 * ── ONE FACT, IN ONE PLACE ─────────────────────────────────────────────────
 * The sentence she says at the start -- "esta chamada é gravada para registo
 * da clínica" -- is not decoration. It is what makes keeping the audio lawful,
 * and the two have to move together: announcing a recording that is not
 * happening is a lie, and keeping one without announcing it is worse than a
 * lie.
 *
 * They could come apart because they live in different places. The sentence
 * is ours, decided per clinic by `clinics.calls_recorded`. The audio is the
 * voice platform's, decided on the agent by `record_voice` in
 * scripts/elevenlabs-privacy.mjs. Nothing in the code could see both, so a
 * clinic switched to "no notice" would have gone on being recorded.
 *
 * ── WHY IT IS OFF ──────────────────────────────────────────────────────────
 * The first real client asked for the sentence to go. One agent answers for
 * every clinic and `record_voice` is set on the agent, so the honest way to
 * give them that was to stop keeping audio at all. It costs nobody anything
 * that exists: no audio has ever reached the panel, because the tool that
 * files a call has no field for one, and no clinic has ever played a call
 * back. What it removes is real: unredacted clinical speech sitting on a
 * third party's servers for a week, for no reader.
 *
 * The transcript is a separate thing and still exists for the seven days the
 * platform keeps it, because the summary in the panel is written from it.
 *
 * ── TO TURN IT BACK ON ─────────────────────────────────────────────────────
 * Both halves, in this order: `record_voice: true` in the privacy script, run
 * against the agent, and then this constant. In that order, because for a few
 * minutes in the middle one of the two is wrong, and "recording without
 * saying" is the wrong one to be.
 */
export const PLATFORM_KEEPS_AUDIO = false

/**
 * Whether this clinic's Telma announces a recording at the start of a call.
 *
 * False for everybody while the platform keeps no audio, whatever the clinic
 * column says. The column survives for the day the answer is yes again.
 */
export function announcesRecording(clinic: { calls_recorded?: boolean | null }): boolean {
  return PLATFORM_KEEPS_AUDIO && clinic.calls_recorded !== false
}
