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

  // ── THE HOUR IS NOT ON OFFER ───────────────────────────────────────────
  // Full, outside the hours, on a blocked day -- or held by this very call.
  //
  // That last one is not a corner case, it is the ordinary path. Telma holds
  // the hour the moment somebody chooses it and the lock lasts three minutes;
  // then she takes the name and the number and files the call. On the clinics
  // that run one diary, her own lock is what leaves the hour with nothing
  // free, so `hold_slot` never reaches the unique index and raises
  // `slot_not_available` rather than `slot_locked` -- and the branch above,
  // which exists precisely so that a call is not refused by its own hold,
  // never runs.
  //
  // What the patient hears is "essa hora foi ocupada entretanto", about an
  // hour that is free and that they were told a moment ago was theirs, and
  // the booking is thrown away. Only on calls that end inside three minutes,
  // which is why it survived: a slower call lets the lock lapse first and the
  // booking goes through. The faster the call, the likelier it is lost.
  //
  // So the lock is read before believing it. Ours, and nothing written into
  // the hour in the meantime, means the hour is ours and the claim stands.
  if (message.includes('slot_not_available')) {
    if (!input.callRef) return { ok: false, because: 'taken' }
    const { data: lock } = await admin
      .from('slot_locks')
      .select('call_ref')
      .eq('clinic_id', input.clinicId)
      .eq('slot_start', input.scheduledAt)
      .maybeSingle()
    if ((lock as { call_ref: string | null } | null)?.call_ref !== input.callRef) {
      return { ok: false, because: 'taken' }
    }
    // Our own hold, and still worth one more question: a lock stops other
    // calls, not another part of this system, so the one thing that would
    // make this a double booking is an appointment already standing in the
    // hour. The four states that are not in the hour any more -- refused,
    // cancelled, expired, and the one already copied into the clinic's own
    // software -- do not count. Listed rather than inverted so that a status
    // added later is treated as occupying the hour until somebody says it
    // does not, which is the safe direction for a diary.
    const { count } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', input.clinicId)
      .eq('scheduled_at', input.scheduledAt)
      .not('status', 'in', '(rejeitada,cancelada,expirada,copiada)')
    return (count ?? 0) > 0 ? { ok: false, because: 'taken' } : { ok: true, held: false }
  }

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
