import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Taking an hour out of circulation before writing a booking into it.
 *
 * ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
 * `hold_slot` was already safe: it reads availability and inserts a lock in one
 * function, so one transaction, and `slot_locks` carries `unique (clinic_id,
 * slot_start)`. Two callers racing for the same hour cannot both come out with
 * a lock; the loser gets a unique violation and is told the hour is gone.
 *
 * Nothing made the *appointment* go through that gate. `record_call` inserts
 * into `appointments` with no capacity check at all, and the two direct inserts
 * in the call webhook do the same. A lock lasts three minutes by design, which
 * is the length of reading a time back to somebody, and a booking call runs two
 * to three minutes: the lock can lapse before the call ends. Then the webhook
 * writes the booking into an hour that, by then, somebody else holds. Both
 * clinics see a perfectly ordinary appointment at the same time in the same
 * diary, and nobody finds out until two patients are at the counter.
 *
 * So every write of an appointment now claims the hour first, through the one
 * function that is atomic. The unique index is what serialises the race; this
 * only makes sure the race is entered.
 *
 * ── WHY THE CALL'S OWN LOCK IS NOT A CLASH ─────────────────────────────────
 * Telma holds the hour while she reads it back, with this call's reference on
 * the lock. At the end of the same call the webhook claims it again, and
 * without this it would be refused by its own hold. A lock carrying our own
 * `call_ref` is ours and the claim stands.
 *
 * ── WHAT A FAILURE MEANS ───────────────────────────────────────────────────
 * `taken`: somebody else has the hour. The booking is not written, and the
 * caller of this decides what to tell the clinic. Losing the booking is bad;
 * writing two patients into one hour is worse, and only one of the two can be
 * put right afterwards by a person reading a panel.
 *
 * `unknown`: the database refused for a reason that is not a clash (it is down,
 * the function is missing, the slot is outside the clinic's hours). The booking
 * is written anyway. This guard exists to stop a double booking, not to become
 * a new way of losing appointments.
 */

type Admin = ReturnType<typeof createAdminClient>

export type SlotClaim =
  | { ok: true; held: boolean }
  | { ok: false; because: 'taken' }
  | { ok: false; because: 'unknown'; error: string }

export async function claimSlot(
  admin: Admin,
  input: {
    clinicId: string
    /** E.164-ish, as the appointment carries it. */
    scheduledAt: string
    durationMinutes: number | null
    resourceId: string | null
    /** The conversation this booking belongs to, so our own hold is not a clash. */
    callRef: string | null
  }
): Promise<SlotClaim> {
  const { data, error } = await admin.rpc('hold_slot', {
    p_clinic_id: input.clinicId,
    p_slot_start: input.scheduledAt,
    p_call_ref: input.callRef,
    p_duration: input.durationMinutes,
    p_resource_id: input.resourceId,
  })

  if (!error) return { ok: true, held: true }

  const message = error.message ?? ''

  // Somebody holds it. Ours, or somebody else's.
  if (message.includes('slot_locked')) {
    if (!input.callRef) return { ok: false, because: 'taken' }
    const { data: lock } = await admin
      .from('slot_locks')
      .select('call_ref')
      .eq('clinic_id', input.clinicId)
      .eq('slot_start', input.scheduledAt)
      .maybeSingle()
    const ref = (lock as { call_ref: string | null } | null)?.call_ref ?? null
    return ref === input.callRef
      ? { ok: true, held: false }
      : { ok: false, because: 'taken' }
  }

  // The hour is not on offer: full, outside the hours, or on a blocked day.
  if (message.includes('slot_not_available')) return { ok: false, because: 'taken' }

  return { ok: false, because: 'unknown', error: message }
}

/**
 * Give the hour back.
 *
 * `record_call` deletes the lock itself after it writes, so only the direct
 * inserts need this. Harmless when there is nothing to delete.
 */
export async function releaseSlot(
  admin: Admin,
  clinicId: string,
  scheduledAt: string
): Promise<void> {
  await admin.rpc('release_slot', { p_clinic_id: clinicId, p_slot_start: scheduledAt })
}
