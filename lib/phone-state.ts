/**
 * Does this clinic have a telephone yet, or only a placeholder?
 *
 * ── WHY A PLACEHOLDER EXISTS AT ALL ───────────────────────────────────────
 * Portuguese national numbers are not sold over Twilio's API on this account:
 * `/AvailablePhoneNumbers/PT/Local.json` answers "not found", and the one we
 * own arrived through a support ticket quoted at three to five working days.
 * So a sign-up cannot end with a number in hand, and refusing the sign-up
 * until one exists would mean no self-service at all.
 *
 * The provisioner therefore returns a number shaped exactly like a real one,
 * with the right dial code and the right number of digits, so that nothing
 * downstream has to care. Its id starts `PNdemo`, and that is the only thing
 * that tells the two apart.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * Because for a while nothing told them apart where it mattered. The welcome
 * email printed the placeholder under "the number Telma answers", which is a
 * fabricated telephone shown to somebody who has just paid, in the first
 * message they get from us. If they had put it on a door it would have rung
 * in somebody else's house.
 *
 * Nothing in this file calls Twilio. It reads what the sign-up already wrote.
 */

export interface PhoneState {
  /** True when a real line exists and can be dialled. */
  ready: boolean
  /** The number to show, or null while there is nothing true to show. */
  number: string | null
}

/** A provisioner id that belongs to a line Twilio actually sold us. */
export function isRealProviderRef(ref: string | null | undefined): boolean {
  return Boolean(ref && !ref.startsWith('PNdemo'))
}

export function phoneState(clinic: {
  assigned_phone?: string | null
  phone_provider_ref?: string | null
  phone_source?: string | null
}): PhoneState {
  // A clinic that kept its own number and is forwarding to ours still needs
  // ours to be real: the forward has to land somewhere.
  const ready = isRealProviderRef(clinic.phone_provider_ref)
  return { ready, number: ready ? (clinic.assigned_phone ?? null) : null }
}
