#!/usr/bin/env node --experimental-strip-types
//
// Who confirms a booking, and how long the hour waits for them.
//
//   npm run test:hold-and-mode
//
// Two settings that between them decide what a patient hears on the telephone
// and what arrives on their phone afterwards, so the pair is worth checking
// without a database: the copy module and the prompt module both import
// nothing, which is what makes this possible.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { messageFor } = await import('../lib/notify-copy.ts')
const { buildPrompt } = await import('../lib/onboarding/prompt.ts')
const { HOLD_CHOICES, HOLD_MINUTES, HOLD_SECONDS, holdLengthSeconds, holdPercentage } =
  await import('../lib/appointment-hold.ts')

const SORRISO = {
  name: 'Clínica Dentária Sorriso',
  timezone: 'Europe/Lisbon',
  language: 'pt',
  phone: '+351211234567',
  assigned_phone: '+351300602615',
}
const SONRISA = {
  name: 'Clínica Dental Sonrisa',
  timezone: 'Europe/Madrid',
  language: 'es',
  phone: '+34911234567',
  assigned_phone: '+34910000001',
}
const AT = '2026-10-08T16:00:00.000Z'

// ── WHAT A PATIENT IS TOLD WHEN NOBODY ANSWERED ───────────────────────────
// The one message in the set that is nobody's decision. The hour went back on
// sale because the window closed, and until this existed the only person who
// still believed they had an appointment was the one who asked for it.

test('a lapsed booking is said to be unconfirmed, not cancelled', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    const said = messageFor('expirada', clinic, AT)
    assert.ok(said.startsWith(clinic.name), 'does not open with the clinic')
    assert.match(said, /\d{1,2}:\d{2}/, 'carries no hour')
    // It has to be readable as "you have no appointment", and it has to say
    // what to do next, because there is nothing to reply to.
    assert.match(said, /não foi possível confirmar|no hemos podido confirmar/)
    assert.match(said, /nova marcação|nueva cita/)
  }
})

test('the hour in a lapsed booking is the clinic\'s, not UTC', () => {
  assert.match(messageFor('expirada', SORRISO, AT), /17:00/)
  assert.match(messageFor('expirada', SONRISA, AT), /18:00/)
  for (const clinic of [SORRISO, SONRISA]) {
    assert.doesNotMatch(messageFor('expirada', clinic, AT), /16:00/)
  }
})

// A refusal is the clinic saying no. A lapse is nobody saying anything. If the
// two read alike there was no reason to add the second one.
test('a lapse does not read like a refusal or a cancellation', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    const lapsed = messageFor('expirada', clinic, AT)
    assert.notEqual(lapsed, messageFor('rejeitada', clinic, AT))
    assert.notEqual(lapsed, messageFor('cancelada', clinic, AT))
  }
})

// The number printed is the one on the clinic's door. `assigned_phone` is the
// hidden end of a forward on a shared line, and a patient told to ring it
// would be handed the one number this product keeps to itself.
test('a lapsed booking sends the patient to the clinic\'s own number', () => {
  for (const clinic of [SORRISO, SONRISA]) {
    const said = messageFor('expirada', clinic, AT, true)
    assert.ok(said.includes(clinic.phone), 'the clinic\'s own number is missing')
    assert.ok(!said.includes(clinic.assigned_phone), 'the shared line was handed out')
  }
  // With no number to print it still has to be an instruction somebody can
  // follow, rather than "ring us" from a sender that cannot be rung.
  const noNumber = messageFor('expirada', { ...SORRISO, phone: null, assigned_phone: null }, AT, true)
  assert.doesNotMatch(noNumber, /null|undefined/)
  assert.match(noNumber, /Contacte a clínica/)
})

// ── HOW LONG THE HOUR WAITS ───────────────────────────────────────────────

test('the choices are real answers to "how long"', () => {
  assert.ok(HOLD_CHOICES.includes(HOLD_MINUTES), 'the default is not on the list')
  const sorted = [...HOLD_CHOICES].sort((a, b) => a - b)
  assert.deepEqual([...HOLD_CHOICES], sorted, 'the list is not in order')
  assert.equal(new Set(HOLD_CHOICES).size, HOLD_CHOICES.length, 'a choice appears twice')
  for (const minutes of HOLD_CHOICES) {
    // The database check constraint from migration 0065. A choice the panel
    // offers and the database refuses would be an error on saving.
    assert.ok(minutes >= 5 && minutes <= 1440, `${minutes} is outside the column's check`)
  }
})

// The bar is drawn against the hold the booking actually got, not against the
// clinic's current setting: a clinic moving from four hours to fifteen minutes
// has bookings already counting down from four hours, and a bar measured
// against the new number would sit full and then jump.
test('the bar measures the window this booking was given', () => {
  const created = '2026-10-08T10:00:00.000Z'
  const fourHours = { created_at: created, expires_at: '2026-10-08T14:00:00.000Z' }
  assert.equal(holdLengthSeconds(fourHours), 4 * 3600)
  assert.equal(holdPercentage(2 * 3600, holdLengthSeconds(fourHours)), 50)

  const quarter = { created_at: created, expires_at: '2026-10-08T10:15:00.000Z' }
  assert.equal(holdLengthSeconds(quarter), 15 * 60)
  assert.equal(holdPercentage(15 * 60, holdLengthSeconds(quarter)), 100)
})

test('a booking with no window falls back rather than dividing by nothing', () => {
  const cases = [
    { created_at: '2026-10-08T10:00:00.000Z', expires_at: null },
    { created_at: '2026-10-08T10:00:00.000Z', expires_at: 'not a date' },
    // Written, apparently, after it expired. Nonsense, but not a reason to
    // draw a negative bar.
    { created_at: '2026-10-08T10:00:00.000Z', expires_at: '2026-10-08T09:00:00.000Z' },
  ]
  for (const appointment of cases) {
    assert.equal(holdLengthSeconds(appointment), HOLD_SECONDS)
  }
  for (const total of [0, -1, Number.NaN]) {
    const percent = holdPercentage(HOLD_SECONDS, total)
    assert.ok(Number.isFinite(percent) && percent >= 0 && percent <= 100, `total ${total}`)
  }
})

// ── WHAT THE AGENT SAYS ON THE TELEPHONE ──────────────────────────────────
// The setting is in the panel and the consequence is in the call. A clinic
// that switched to automatic confirmation while Telma kept telling patients
// the booking was "por confirmar pela clínica" would be the worst of both.

const BASE = {
  clinic_name: 'Clínica Dentária Sorriso',
  specialty: 'Clínica dentária',
  address: 'Rua das Flores 12, Lisboa',
  phone: '+351211234567',
  timezone: 'Europe/Lisbon',
  services: ['Consulta de avaliação'],
  custom_services: null,
  opening_hours: ['Segunda: 09:00-19:00'],
  appointment_duration_minutes: 30,
  languages: ['Português'],
  formality: 'formal',
  price_info: null,
  fallback_policy: 'message',
  fallback_number: null,
  briefing: null,
  can_book: true,
  within_opening_hours: true,
  emergency_number: null,
  emergency_protocol: null,
  recording: true,
  professionals: [],
  caller_id: null,
  veterinary: false,
}

test('the agent closes the call the way the clinic configured it', () => {
  for (const language of ['pt', 'es']) {
    const manual = buildPrompt({ ...BASE, appointments_auto_confirmed: false }, language).text
    const auto = buildPrompt({ ...BASE, appointments_auto_confirmed: true }, language).text

    assert.match(manual, /por confirmar pela clínica|pendiente de que la clínica la confirme/)
    assert.match(auto, /A marcação fica confirmada|La cita queda confirmada/)
    // And the opposite is not left in the same prompt, which is how a model
    // ends up saying both things in one breath.
    assert.doesNotMatch(
      auto,
      /Dizes que \*\*fica por confirmar pela clínica\*\*|Dices que \*\*queda pendiente de que la clínica la confirme\*\*/
    )
  }
})

// A clinic that cannot book at all has no step 10 to swap, and asking for
// automatic confirmation of bookings it never takes must not invent one.
test('a clinic that does not book is unaffected by the setting', () => {
  const off = { ...BASE, can_book: false }
  assert.equal(
    buildPrompt({ ...off, appointments_auto_confirmed: true }, 'pt').text,
    buildPrompt({ ...off, appointments_auto_confirmed: false }, 'pt').text
  )
})
