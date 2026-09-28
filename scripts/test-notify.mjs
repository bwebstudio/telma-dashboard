#!/usr/bin/env node --experimental-strip-types
//
// What the patient is told when the clinic decides.
//
//   npm run test:notify
//
// lib/notify-copy.ts imports nothing, which is what makes this possible: the
// sentence a patient reads is checkable without a database, a Twilio account or
// a running application.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { messageFor, senderIdFor } = await import('../lib/notify-copy.ts')

const SORRISO = { name: 'Clínica Dentária Sorriso', timezone: 'Europe/Lisbon', language: 'pt', assigned_phone: '+351300602615' }
const SONRISA = { name: 'Clínica Dental Sonrisa', timezone: 'Europe/Madrid', language: 'es', assigned_phone: '+34910000001' }
// 16:00 UTC. 17:00 in Lisbon, 18:00 in Madrid, and neither of them 16:00.
const AT = '2026-10-08T16:00:00.000Z'

// The whole reason this is worth a test. `scheduled_at` is UTC, and a message
// sent to stop somebody arriving at the wrong time, telling them the wrong
// time, is worse than sending nothing.
test('the hour is the clinic\'s, not UTC', () => {
  assert.match(messageFor('confirmada', SORRISO, AT, null), /17:00/)
  assert.match(messageFor('confirmada', SONRISA, AT, null), /18:00/)
  for (const clinic of [SORRISO, SONRISA]) {
    assert.doesNotMatch(messageFor('confirmada', clinic, AT, null), /16:00/)
  }
})

test('every kind says the clinic, the hour and what to do', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    for (const kind of ['confirmada', 'alterada', 'rejeitada']) {
      const said = messageFor(kind, clinic, AT, null)
      assert.ok(said.startsWith(clinic.name), `${kind}: does not open with the clinic`)
      assert.match(said, /\d{1,2}:\d{2}/, `${kind}: carries no hour`)
      // A patient who cannot come, or cannot make the new hour, has to be told
      // how to say so. The sender is the clinic's own line.
      assert.match(said, /ligue-nos|llámenos/i, `${kind}: no way back to the clinic`)
    }
  }
})

// Moving an hour is the one a patient must not miss, and it has to read
// differently from a plain confirmation or nobody notices the hour changed.
test('a moved appointment does not read like a confirmed one', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    assert.notEqual(
      messageFor('confirmada', clinic, AT, null),
      messageFor('alterada', clinic, AT, null)
    )
  }
})

test('a refusal carries the clinic\'s reason when there is one, and stands without', () => {
  const why = { pt: 'Essa hora ficou ocupada', es: 'Esa hora se ha ocupado' }
  for (const [clinic, reason] of [[SORRISO, why.pt], [SONRISA, why.es]]) {
    assert.ok(messageFor('rejeitada', clinic, AT, reason).includes(reason))
    const bare = messageFor('rejeitada', clinic, AT, null)
    assert.ok(bare.length > 40, 'a refusal with no reason came out empty')
    assert.doesNotMatch(bare, /null|undefined/)
  }
})

// A clinic in neither language must still be readable rather than blank.
test('an unknown language falls back rather than breaking', () => {
  const odd = { name: 'Clinic', timezone: 'Europe/Lisbon', language: 'en' }
  const said = messageFor('confirmada', odd, AT, null)
  assert.ok(said.startsWith('Clinic'))
  assert.match(said, /\d{1,2}:\d{2}/)
})

// Portuguese voice numbers mostly cannot carry an SMS -- Twilio answered
// "'From' number +351300602615 is not SMS-capable" on the first real attempt.
// The clinic's name goes in the From field instead, and Twilio's rules for that
// are eleven characters, at least one letter, and no accents.
test('the clinic can be its own sender, inside Twilio\'s rules', () => {
  const cases = [
    ['Clínica Dentária Sorriso', 'Sorriso'],
    ['Clínica Dental Sonrisa', 'Sonrisa'],
    ['Consultório da Dra. Ruiz', 'Dra Ruiz'],
  ]
  for (const [name, want] of cases) {
    assert.equal(senderIdFor(name), want, `${name} came out wrong`)
  }
  // The rules, on anything that can be thrown at it.
  for (const name of ['Clínica', 'Centro Médico 24', '24', 'A'.repeat(40), 'Ção Ãé', '']) {
    const id = senderIdFor(name)
    assert.ok(id.length >= 1 && id.length <= 11, `${name}: ${id.length} characters`)
    assert.match(id, /[A-Za-z]/, `${name}: a sender of only digits is refused`)
    assert.match(id, /^[A-Za-z0-9 ]+$/, `${name}: "${id}" has characters Twilio does not take`)
  }
})

// An alphanumeric sender is one-way: nothing can be replied to and there is no
// number in the phone to ring back. "Call us" with no number to call is an
// instruction that cannot be followed.
test('a message from a name carries the number to ring', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    const fromName = messageFor('confirmada', clinic, AT, null, true)
    const fromNumber = messageFor('confirmada', clinic, AT, null, false)
    assert.ok(fromName.includes(clinic.assigned_phone), 'no number to ring in a one-way message')
    // And not when it comes from the number itself, which is already in the
    // phone the patient is holding.
    assert.ok(!fromNumber.includes(clinic.assigned_phone), 'the number is repeated for nothing')
  }
})
