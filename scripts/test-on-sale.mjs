#!/usr/bin/env node
//
// What is actually on sale, and what only looks like it is.
//
//   npm run test:on-sale
//
// Two things were being sold that the product cannot deliver, and both were
// sold from more than one door: the sign-up form, the server action behind it,
// the /conta purchase button and the purchases API. Turning each off was a
// constant in one file; this is the test that the constants stay off, because
// the way they come back is somebody restoring a list from an older copy and
// nothing complaining.
//
// Rede: sold as several locations under one contract, each with its own number
// and its own agenda, all in one panel. There is no table of locations, a user
// belongs to one clinic, and a clinic is one row with one number and one
// agenda. 599 EUR a month, and 149 EUR for each location beyond three.
//
// WhatsApp: sold as Telma answering and booking on WhatsApp. Nothing in the
// product receives a WhatsApp message. 49 EUR a month.
//
// Neither is deleted. The prices are still in Stripe and in the `plans` table,
// the copy is still in content/, and the code is still here. This only says
// they are not for sale today, and names the single line that sells each one
// again.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { SIGNUP_PLANS, PRICED_PLANS, WHATSAPP_ON_SALE, NEW_NUMBERS_ON_SALE } = await import(
  '../lib/onboarding/catalog.ts'
)
const { validateStep } = await import('../lib/onboarding/wizard-schema.ts')
const { validSignup, newNumberSignup } = await import('../lib/onboarding/fixtures.ts')
const { COMING_SOON } = await import('../lib/purchase-utils.ts')

test('the sign-up form does not sell Rede', () => {
  assert.equal(
    SIGNUP_PLANS.includes('rede'),
    false,
    'Rede is back in SIGNUP_PLANS. There is still no such thing as a location.'
  )
})

test('but Rede is not deleted: its price is still priced', () => {
  assert.ok(PRICED_PLANS.includes('rede'), 'Rede fell out of PRICED_PLANS')
  assert.deepEqual([...SIGNUP_PLANS], ['essencial', 'clinica'])
})

test('the WhatsApp add-on is not on sale, through any door', () => {
  assert.equal(WHATSAPP_ON_SALE, false, 'WHATSAPP_ON_SALE is back on')
  assert.ok(
    COMING_SOON.includes('whatsapp'),
    'whatsapp left COMING_SOON, so /conta offers a buy button again'
  )
})

test('English is still off, and so is Spanish as an add-on', () => {
  // Same list, same reason: an add-on for a language is not sold while the
  // language is not offered. Checked here so the three stay together.
  assert.ok(COMING_SOON.includes('language_en'))
  assert.ok(COMING_SOON.includes('language_es'))
})

test('the sign-up does not promise a number it cannot buy', () => {
  assert.equal(NEW_NUMBERS_ON_SALE, false, 'NEW_NUMBERS_ON_SALE is back on')
})

test('and the schema refuses it, not only the form', () => {
  // The form is a courtesy. A draft saved before the switch, or a POST
  // straight at the API, has to meet the same answer.
  const result = validateStep(3, newNumberSignup('x'))
  assert.equal(result.ok, false, 'a new-number sign-up was accepted')
  assert.ok(
    'phone_option' in result.errors,
    `refused, but on ${Object.keys(result.errors).join(', ')} instead of phone_option`
  )
})

test('keeping your own number still goes through', () => {
  // The other half of the same rule: a switch that refuses everything would
  // pass the test above and close the business.
  const result = validateStep(3, validSignup('x'))
  assert.equal(
    result.ok,
    true,
    result.ok ? '' : `a normal sign-up was refused: ${JSON.stringify(result.errors)}`
  )
})
