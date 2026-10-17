import type { Clinic } from '@/lib/types'
import { isRealProviderRef } from '@/lib/phone-state'

/**
 * What a clinic still has to answer before Telma can take a call for it.
 *
 * The sign-up identifies the clinic and buys it a number. It does not ask how
 * Telma should answer, because that is configured in the panel and was always
 * configured in the panel -- asking in both places is what made a clinic
 * wonder, weeks later, which of the two it was supposed to go back to.
 *
 * So something has to stand between "signed up" and "answering", and it has to
 * be the clinic's own decision rather than ours. This is the list it decides
 * against, and the rule for what is on it is the same rule the sign-up used to
 * be judged by: **if this is missing, what happens on the first call?**
 *
 * Opening hours missing: she cannot offer a single time, and "when are you
 * open" is the second most asked question on a clinic's telephone.
 * Services missing: she has nothing to check a request against, and booking
 * something a clinic does not do sends somebody across town to be told no.
 *
 * Everything else has a safe default and is deliberately not here. A clinic
 * that never sets an emergency number gets "call 112", which is right. One
 * that never chooses how to address people gets "o senhor", which is right in
 * both countries. Blocking activation on those would be us deciding what a
 * clinic has to care about.
 */

export interface SetupStep {
  /** Stable id, for the label and for the link. */
  id: 'hours' | 'services' | 'number'
  done: boolean
  /** Empty when the step is not theirs to do. */
  href: string
}

export function setupSteps(
  clinic: Pick<
    Clinic,
    'services' | 'custom_services' | 'phone_provider_ref'
  > | null,
  /** How many days of the week have hours on them. */
  openDays: number
): SetupStep[] {
  const services = [
    ...(clinic?.services ?? []),
    ...String(clinic?.custom_services ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  ]
  return [
    { id: 'hours', done: openDays > 0, href: '/horarios' },
    { id: 'services', done: services.length > 0, href: '/telma' },
    // ── THE ONE STEP THAT IS NOT THEIRS ───────────────────────────────
    // Telma cannot answer a line that does not exist, and in Portugal the
    // line is ordered through Twilio support and takes days. So this gates
    // activation like the other two, and unlike them there is nowhere to
    // send the clinic: waiting is the whole of their part.
    //
    // It is in the list rather than checked only in the action, because a
    // disabled button with no reason beside it is a dead end, and "we are
    // still getting your number" is a reason a person can accept.
    { id: 'number', done: isRealProviderRef(clinic?.phone_provider_ref), href: '' },
  ]
}

/** True when nothing is left. The button is disabled until it is. */
export function readyToActivate(steps: SetupStep[]): boolean {
  return steps.every((s) => s.done)
}
