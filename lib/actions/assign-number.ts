'use server'

import { getAppUser } from '@/lib/auth'
import { assignNumberCore, type AssignResult } from '@/lib/numbers/assign'

/**
 * The line arrived. Give it to the clinic and tell them.
 *
 * ── WHY THIS IS NOT AUTOMATIC ─────────────────────────────────────────────
 * Portuguese national numbers are not sold over Twilio's API on this account.
 * They are ordered through support, quoted at three to five working days, and
 * delivered by a human in an email. So something has to carry the number from
 * that email into the clinic's row, and until Twilio opens self-serve
 * inventory for Portugal that something is us.
 *
 * What is automatic is everything after: the row, the webhook on the number,
 * the email to the clinic, and the note in its own activity log. The part a
 * person does is paste one number.
 *
 * ── WHY IT REFUSES TO OVERWRITE A REAL LINE ───────────────────────────────
 * A clinic already answering on a number would, if this ran twice, be moved
 * to a new one while its patients went on dialling the old. The placeholder
 * can be replaced freely because nobody has ever dialled it.
 */
export async function assignNumber(input: {
  clinicId: string
  number: string
  providerRef: string
}): Promise<AssignResult> {
  const user = await getAppUser()
  if (user?.role !== 'interno') return { ok: false, error: 'not_allowed' }
  return assignNumberCore(input)
}
