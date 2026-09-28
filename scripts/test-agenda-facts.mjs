#!/usr/bin/env node
//
// What a day says, at every zoom.
//
//   npm run test:agenda-facts
//
// lib/agenda-facts.ts is where the day, the week and the month agree. The tests
// that matter are the two facts no zoom is allowed to drop: a booking waiting
// for an answer, and an hour that came back because somebody called off.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { dayFacts, needsAnswer, SHOWN_AS } = await import('../lib/agenda-facts.ts')

const at = (status, extra = {}) => ({ id: Math.random().toString(), status, ...extra })

test('a cancelled booking gives its hour back', () => {
  const f = dayFacts([at('confirmada'), at('cancelada'), at('pendente')], 8)
  assert.equal(f.busy, 2, 'a cancelled booking is still holding an hour')
  assert.equal(f.free, 6)
})

test('a booking waiting for an answer is still holding its hour', () => {
  // It is a pre-marcação: the slot is held while the clinic decides, which is
  // why it counts as busy and as pending at the same time.
  const f = dayFacts([at('pendente')], 8)
  assert.equal(f.busy, 1)
  assert.equal(f.pending, 1)
})

test('an acknowledged cancellation stops asking', () => {
  const seen = dayFacts([at('cancelada', { cancel_seen_at: '2026-09-28T09:00:00Z' })], 8)
  assert.equal(seen.cancelled, 0)
  assert.equal(needsAnswer(seen), false)

  const unseen = dayFacts([at('cancelada')], 8)
  assert.equal(unseen.cancelled, 1)
  assert.equal(needsAnswer(unseen), true)
})

test('a refused or expired booking reads as cancelled', () => {
  assert.equal(SHOWN_AS.rejeitada, 'cancelada')
  assert.equal(SHOWN_AS.expirada, 'cancelada')
  assert.equal(SHOWN_AS.copiada, 'confirmada')
})

test('closed and blocked are not the same thing', () => {
  const closed = dayFacts([], 0)
  assert.equal(closed.closed, true)
  assert.equal(closed.blocked, false)

  // A day the clinic shut on purpose. It is not "closed" as in "we never open
  // on Sundays": somebody chose it, and the screen says so differently.
  const shut = dayFacts([], 0, true)
  assert.equal(shut.blocked, true)
  assert.equal(shut.closed, false)
})

test('a day with nothing to answer asks for nothing', () => {
  assert.equal(needsAnswer(dayFacts([at('confirmada'), at('copiada')], 8)), false)
})
