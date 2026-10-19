#!/usr/bin/env node
//
// The week is granted by a link, and only by the right one.
//
//   npm run test:implementation-week
//
// It is not a trial and not a discount: a clinic we chose is not charged for
// the week it takes to set it up, and the invoice simply starts seven days
// later with no line on it saying anything was given away.
//
// Granted by `?implantacao=` rather than a box on the form, because it is for
// clinics we pick and a visible field would have to be explained to everybody
// who does not have one. That makes the value a thing a browser can type, so
// the only check that counts is the one on the server, and this is it.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { implementationDaysFor, IMPLEMENTATION_CODE, IMPLEMENTATION_DAYS } = await import(
  '../lib/onboarding/catalog.ts'
)

test('the right code buys the week', () => {
  assert.equal(implementationDaysFor(IMPLEMENTATION_CODE), IMPLEMENTATION_DAYS)
  assert.equal(IMPLEMENTATION_DAYS, 7)
})

test('case and stray spaces do not decide who pays', () => {
  // It travels in a URL, gets copied into an email and pasted back out.
  assert.equal(implementationDaysFor(IMPLEMENTATION_CODE.toLowerCase()), IMPLEMENTATION_DAYS)
  assert.equal(implementationDaysFor(`  ${IMPLEMENTATION_CODE}  `), IMPLEMENTATION_DAYS)
})

test('everybody else pays from the first day', () => {
  for (const wrong of [null, undefined, '', '   ', 'SEMANA', 'semana-telma-2', 'IMPLANTACAO15']) {
    assert.equal(implementationDaysFor(wrong), 0, `"${wrong}" was given a free week`)
  }
})

test('the discount codes are not a way in', () => {
  // They are Stripe promotion codes and live in Stripe. Typing one into the
  // implementation parameter must not buy a week as well as a discount.
  assert.equal(implementationDaysFor('IMPLANTACAO15'), 0)
  assert.equal(implementationDaysFor('IMPLANTACAO10'), 0)
})
