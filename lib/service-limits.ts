/**
 * The numbers behind leaving, kept out of the actions that use them.
 *
 * A 'use server' module may only export async functions, and both of these
 * are read by the screen as well as by the server: the panel prints the
 * grace period in the sentence that asks for confirmation, and it has to be
 * the same number the sweep counts.
 */

/** How long a pause may last. A clinic away longer than this is not pausing. */
export const PAUSE_MONTHS = [1, 2, 3] as const

/**
 * How long erasure waits before it happens.
 *
 * Everything here is somebody's medical appointment, and the person pressing
 * the button is rarely the person who will miss it. A month is long enough
 * for a clinic that changed its mind, or whose receptionist pressed it in
 * anger, and short enough to be a real answer to "delete my data".
 */
export const ERASURE_GRACE_DAYS = 30
