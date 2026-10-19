#!/usr/bin/env node --experimental-strip-types
//
// What the clinic's week says, and when it says the door is open.
//
//   npm run test:opening-hours
//
// The diary is the only record of when a clinic is open, and two things read
// it: the sentence Telma says out loud when somebody asks what time they
// open, and the decision about whether a call is arriving during opening
// hours at all. Both used to take the earliest opening and the latest closing
// of each day, which is the same thing only for a clinic that never closes
// for lunch.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { groupHours, spansText, isOpenNow } = await import('../lib/opening-hours.ts')

/** What the sign-up writes for a clinic that closes between one and two. */
const WITH_BREAK = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, start_time: '09:00:00', end_time: '13:00:00' },
  { weekday, start_time: '14:00:00', end_time: '19:00:00' },
])

test('a lunch break survives into what Telma says', () => {
  const week = groupHours(WITH_BREAK)
  assert.equal(week.length, 5)
  assert.equal(spansText(week[0]), '09:00-13:00, 14:00-19:00')
})

// The expensive half. Half past one on a Tuesday is not opening hours, and
// answering that it is turns the one call that needed the emergency number
// into an ordinary one.
test('the clinic is shut during its own break', () => {
  const week = groupHours(WITH_BREAK)
  const at = (iso) => isOpenNow(week, 'Europe/Lisbon', new Date(iso))
  // 2026-10-20 is a Tuesday. Lisbon is UTC+1 in October.
  assert.equal(at('2026-10-20T09:30:00+01:00'), true, 'half past nine')
  assert.equal(at('2026-10-20T13:30:00+01:00'), false, 'half past one, on the break')
  assert.equal(at('2026-10-20T15:00:00+01:00'), true, 'three in the afternoon')
  assert.equal(at('2026-10-20T20:00:00+01:00'), false, 'after closing')
  assert.equal(at('2026-10-18T11:00:00+01:00'), false, 'a Sunday it does not open')
})

test('a day with one window reads as one window', () => {
  const week = groupHours([{ weekday: 6, start_time: '09:00:00', end_time: '13:00:00' }])
  assert.equal(spansText(week[0]), '09:00-13:00')
})

// A week edited by hand ends up as hourly rows. They describe the same open
// door and must not be read out as eight separate windows.
test('touching rows are one window', () => {
  const hourly = [9, 10, 11, 12].map((h) => ({
    weekday: 1,
    start_time: `${String(h).padStart(2, '0')}:00:00`,
    end_time: `${String(h + 1).padStart(2, '0')}:00:00`,
  }))
  const week = groupHours(hourly)
  assert.equal(spansText(week[0]), '09:00-13:00')
})

test('rows out of order, and rows that close before they open', () => {
  const week = groupHours([
    { weekday: 1, start_time: '14:00:00', end_time: '19:00:00' },
    { weekday: 1, start_time: '09:00:00', end_time: '13:00:00' },
    // Nonsense, and not a reason to produce a window that runs backwards.
    { weekday: 1, start_time: '20:00:00', end_time: '20:00:00' },
  ])
  assert.equal(spansText(week[0]), '09:00-13:00, 14:00-19:00')
})

test('a clinic with no diary is never open', () => {
  assert.deepEqual(groupHours([]), [])
  assert.equal(isOpenNow([], 'Europe/Lisbon'), false)
})
