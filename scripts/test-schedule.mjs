#!/usr/bin/env node --experimental-strip-types
//
// The timetable, written and read back.
//
//   npm run test:schedule
//
// `buildSlots` turns the set-up screen's answers into rows, and
// `slotsToSimple` turns rows back into that screen. The pair has to survive
// the round trip, because what comes back is what the clinic is shown and
// what the schema then validates: a break read back wrong is a screen that
// refuses to save and cannot say why.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { buildSlots, slotsToSimple } = await import('../lib/onboarding/schedule.ts')
const { wizardSchemas, fieldErrors } = await import('../lib/onboarding/wizard-schema.ts')

const WEEK = {
  weekdays: { closed: false, open: '09:00', close: '19:00' },
  saturday: { closed: true, open: '09:00', close: '13:00' },
  sunday: { closed: true, open: '09:00', close: '13:00' },
}
const DURATIONS = { appointment_duration_minutes: 30, min_interval_minutes: 30 }

/** What the screen would do with these rows: read them, then try to save. */
function readBackAndSave(slots) {
  const simple = slotsToSimple(slots)
  const parsed = wizardSchemas('pt').hours.safeParse({ ...simple, ...DURATIONS })
  return { simple, errors: parsed.success ? null : fieldErrors(parsed.error) }
}

test('a week written by the sign-up comes back as itself', () => {
  for (const pause of [
    { enabled: true, start: '13:00', end: '14:00' },
    { enabled: false, start: '13:00', end: '14:00' },
  ]) {
    const { simple } = readBackAndSave(buildSlots({ ...WEEK, pause }))
    assert.equal(simple.pause.enabled, pause.enabled)
    if (pause.enabled) {
      assert.equal(simple.pause.start, pause.start)
      assert.equal(simple.pause.end, pause.end)
    }
    assert.equal(simple.weekdays.open, '09:00')
    assert.equal(simple.weekdays.close, '19:00')
    assert.equal(simple.saturday.closed, true)
  }
})

// The one that broke. A day cut into hourly rows has a gap between every
// pair, and reading the break off the first of them gave 10:00 to 10:00: a
// break ending when it starts, which the schema refuses. The screen then
// could not save and the clinic was left pressing a button that did nothing.
test('a day cut into many rows reads its real break', () => {
  const hourly = [9, 10, 11, 14, 15, 16].flatMap((h) =>
    [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start_time: `${String(h).padStart(2, '0')}:00:00`,
      end_time: `${String(h + 1).padStart(2, '0')}:00:00`,
    }))
  )
  const { simple, errors } = readBackAndSave(hourly)
  assert.equal(errors, null, `the screen could not save: ${JSON.stringify(errors)}`)
  assert.deepEqual(simple.pause, { enabled: true, start: '12:00', end: '14:00' })
})

// Whatever the rows look like, the screen must open on something it will
// accept. Anything else is a dead end with no way out of it.
test('what is read back is always saveable', () => {
  const cases = [
    [],
    [{ weekday: 1, start_time: '09:00:00', end_time: '17:00:00' }],
    // Touching rows: no gap, so no break rather than a break of nothing.
    [
      { weekday: 1, start_time: '09:00:00', end_time: '13:00:00' },
      { weekday: 1, start_time: '13:00:00', end_time: '19:00:00' },
    ],
    // Out of order, which a query without an ORDER BY can hand us.
    [
      { weekday: 1, start_time: '15:00:00', end_time: '19:00:00' },
      { weekday: 1, start_time: '09:00:00', end_time: '13:00:00' },
    ],
    // A day that is only Saturday.
    [{ weekday: 6, start_time: '09:00:00', end_time: '13:00:00' }],
  ]
  for (const slots of cases) {
    const { simple, errors } = readBackAndSave(slots)
    assert.equal(errors, null, `${JSON.stringify(slots)} came back unsaveable: ${JSON.stringify(errors)}`)
    if (simple.pause.enabled) {
      assert.ok(simple.pause.start < simple.pause.end, 'a break that ends before it starts')
    }
  }
})

// The message has to reach the input that draws it. The form renders
// errors['pause.end']; an error flattened to 'pause' is a message that exists,
// is correct, and is shown nowhere.
test('a bad break complains under the break', () => {
  const parsed = wizardSchemas('pt').hours.safeParse({
    ...WEEK,
    pause: { enabled: true, start: '10:00', end: '10:00' },
    ...DURATIONS,
  })
  assert.equal(parsed.success, false)
  const errors = fieldErrors(parsed.error)
  assert.ok(errors['pause.end'], `complained as ${Object.keys(errors).join(', ')}`)
})
