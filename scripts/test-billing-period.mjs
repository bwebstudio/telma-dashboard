import test from 'node:test'
import assert from 'node:assert/strict'

import { billingPeriod } from '../lib/usage-period.ts'

const at = (s) => new Date(s)
const day = (d) => d.toISOString().slice(0, 10)

// The first clinic pays from the 27th. On the 1st of the month the old counter
// went back to zero in the middle of a month they had already half spent.
test('the window is the subscription month, not the calendar one', () => {
  const clinic = { plan_renews_at: '2026-11-27', billing_cycle: 'monthly' }
  const p = billingPeriod(clinic, at('2026-11-23T12:00:00Z'))
  assert.equal(day(p.start), '2026-10-27')
  assert.equal(day(p.end), '2026-11-27')
  assert.equal(p.fromSubscription, true)
})

// The first of December is inside the period that started on 27 November, and
// the counter has to keep counting instead of starting again.
test('a new calendar month does not reset it', () => {
  const clinic = { plan_renews_at: '2026-11-27', billing_cycle: 'monthly' }
  const p = billingPeriod(clinic, at('2026-12-01T09:00:00Z'))
  assert.equal(day(p.start), '2026-11-27')
  assert.equal(day(p.end), '2026-12-27')
})

// The renewal date is written by the Stripe webhook, which spent a month
// dropping every invoice. A date left behind must not freeze the counter.
test('a renewal date left in the past still gives the current window', () => {
  const clinic = { plan_renews_at: '2026-09-20', billing_cycle: 'monthly' }
  const p = billingPeriod(clinic, at('2026-11-23T12:00:00Z'))
  // Dois meses à frente do que ficou escrito, e é o que contém hoje.
  assert.equal(day(p.start), '2026-11-20')
  assert.equal(day(p.end), '2026-12-20')
})

// Adding a month to the 31st lands in the month after next in JavaScript, and
// a clinic that signed up on the 31st would skip February every year.
test('the end of the month is clamped, not rolled over', () => {
  const clinic = { plan_renews_at: '2027-03-31', billing_cycle: 'monthly' }
  const p = billingPeriod(clinic, at('2027-03-01T00:00:00Z'))
  assert.equal(day(p.start), '2027-02-28')
  assert.equal(day(p.end), '2027-03-31')
})

test('a yearly subscription gets a year', () => {
  const clinic = { plan_renews_at: '2027-04-10', billing_cycle: 'annual' }
  const p = billingPeriod(clinic, at('2026-11-23T12:00:00Z'))
  assert.equal(day(p.start), '2026-04-10')
  assert.equal(day(p.end), '2027-04-10')
})

// Somebody who never paid has no subscription to read, and for them the
// calendar month is the only month there is.
test('without a subscription it falls back to the calendar month', () => {
  const p = billingPeriod({ plan_renews_at: null, billing_cycle: null }, at('2026-11-23T12:00:00Z'))
  assert.equal(day(p.start), '2026-11-01')
  assert.equal(day(p.end), '2026-12-01')
  assert.equal(p.fromSubscription, false)
})

test('a date that is not a date falls back too', () => {
  const p = billingPeriod({ plan_renews_at: 'qualquer coisa', billing_cycle: 'monthly' }, at('2026-11-23T12:00:00Z'))
  assert.equal(day(p.start), '2026-11-01')
  assert.equal(p.fromSubscription, false)
})
