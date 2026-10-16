/**
 * How a clinic points its own telephone at ours.
 *
 * ── NO IMPORTS, NO LABELS ──────────────────────────────────────────────────
 * One copy of the codes, read by the welcome email and by the panel card. The
 * two said the same thing in two files once before in this project, with the
 * voice settings, and they drifted: the sign-up previewed one voice and the
 * telephone used another. The codes are worse to get wrong than a voice. A
 * clinic that dials the unconditional code when it asked for "only the ones
 * nobody answered" stops hearing its own phone ring, and finds out from a
 * patient.
 *
 * The wording lives with each surface, because the email writes to somebody
 * who has not seen the panel and the panel writes to somebody looking at their
 * own number. Only the ids and the digits are shared.
 */

export type ForwardType = 'no_answer' | 'all'

export type ForwardCodeId = 'all' | 'noAnswer' | 'busy' | 'unreachable'

export interface ForwardCode {
  id: ForwardCodeId
  code: string
}

/**
 * Cancels every forward on the line, conditional and unconditional alike.
 *
 * One code to undo rather than one per code: somebody undoing this is usually
 * doing it because something went wrong, and that is the worst moment to hand
 * them a list and ask which three of the four they set.
 */
export const FORWARD_UNDO = '##002#'

/**
 * The GSM codes, filled in with the number Telma answers on.
 *
 * Three for `no_answer`, not one. "Nobody picked up" is three conditions on a
 * telephone and each has its own code: no answer, engaged, and out of range.
 * Forwarding only the first leaves a patient hearing the engaged tone, which
 * is the call a clinic most wanted answered.
 */
export function forwardCodes(
  toNumber: string,
  type: ForwardType | null | undefined
): ForwardCode[] {
  // Spaces and dashes are how a number is written for a human to read, and a
  // dialled code has room for neither.
  const n = (toNumber ?? '').replace(/[\s -]/g, '')
  if (!n) return []
  return type === 'all'
    ? [{ id: 'all', code: `**21*${n}#` }]
    : [
        { id: 'noAnswer', code: `**61*${n}#` },
        { id: 'busy', code: `**67*${n}#` },
        { id: 'unreachable', code: `**62*${n}#` },
      ]
}
