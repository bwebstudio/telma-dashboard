#!/usr/bin/env node
//
// Nobody gets written into an hour somebody else is already in.
//
//   npm run test:booking-guard
//
// Two things stood between a double booking and a clinic, and neither was
// holding. `record_call` inserts into `appointments` with no capacity check at
// all, and the two direct inserts in the call webhook did the same. The lock
// Telma takes while she reads a time back lasts three minutes; a booking call
// runs two to three. So the hour could be claimed by one conversation, let go
// while that conversation was still talking, claimed by another, and written
// twice. Both clinics see an ordinary appointment. Nobody finds out until two
// people are at the counter.
//
// The same run against production before the fix produced two appointments at
// the same hour from two simultaneous calls; afterwards, one, and the loser was
// told why. This file tests the decision that makes that true, without needing
// a database: the stub below is the only thing standing in for Postgres, and
// the unique index on `slot_locks` is what does the real work behind it.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { claimSlot } = await import('../lib/slot-claim.ts')
const { plausibleName } = await import('../lib/phone.ts')

/** A Postgres that answers however this test needs it to. */
function stub({ rpc, lock }) {
  return {
    rpc: async () => rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: lock ?? null }) }),
        }),
      }),
    }),
  }
}

const slot = {
  clinicId: 'c1',
  scheduledAt: '2026-11-02T08:00:00+00:00',
  durationMinutes: 30,
  resourceId: null,
  callRef: 'conversation-a',
}

test('an hour nobody holds is claimed', async () => {
  const r = await claimSlot(stub({ rpc: { data: {}, error: null } }), slot)
  assert.equal(r.ok, true)
})

test('an hour somebody else holds is refused', async () => {
  const r = await claimSlot(
    stub({ rpc: { data: null, error: { message: 'slot_locked' } }, lock: { call_ref: 'conversation-b' } }),
    slot
  )
  assert.deepEqual(r, { ok: false, because: 'taken' })
})

// The agent holds the hour while she reads it back, and then the webhook claims
// it again at the end of the same call. Without this the booking would be
// refused by its own hold, and every single booking would be lost.
test('our own hold is not a clash', async () => {
  const r = await claimSlot(
    stub({ rpc: { data: null, error: { message: 'slot_locked' } }, lock: { call_ref: 'conversation-a' } }),
    slot
  )
  assert.equal(r.ok, true)
})

test('an hour that is no longer on offer is refused', async () => {
  const r = await claimSlot(stub({ rpc: { data: null, error: { message: 'slot_not_available' } } }), slot)
  assert.deepEqual(r, { ok: false, because: 'taken' })
})

// A guard that turns a database hiccup into a lost appointment is worse than
// the thing it guards against: one is rare and recoverable by a person reading
// a panel, the other is silent.
test('a database that is down does not eat the booking', async () => {
  const r = await claimSlot(stub({ rpc: { data: null, error: { message: 'connection refused' } } }), slot)
  assert.equal(r.ok, false)
  assert.equal(r.because, 'unknown')
})

test('a booking with nobody expected is refused', () => {
  for (const nothing of [null, undefined, '', '  ', 7, '.', '-']) {
    assert.equal(plausibleName(nothing), false, `accepted ${JSON.stringify(nothing)} as a name`)
  }
  for (const name of ['Ana', 'Ana Dias', '  Jo  ', 'Zoë', '李雷']) {
    assert.equal(plausibleName(name), true, `refused ${JSON.stringify(name)}`)
  }
})
