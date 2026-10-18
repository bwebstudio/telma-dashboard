#!/usr/bin/env node
//
// That every rule the sign-up claims to enforce is still attached to something.
//
//   npm run test:signup-rules
//
// /test-onboarding runs a list of deliberately broken payloads and reports
// which field each one was rejected on. That list numbered its cases by step,
// from one to six, and the sign-up has had three steps since the hours, the
// services and the way Telma answers moved to the panel. Nobody renumbered it.
//
// So six cases were being checked against the wrong schema and passing, one
// was checking a `voice_id` the browser no longer sends and could never fail,
// and four crashed outright on a step that does not exist. The page reported
// green on rules that were not running.
//
// It failed silently because a test bench has nobody testing it. This is that
// nobody.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { validateSection } = await import('../lib/onboarding/wizard-schema.ts')
const { INVALID_CASES, validSignup, portingSignup, spanishSignup } = await import(
  '../lib/onboarding/fixtures.ts'
)

test('every broken payload is refused, on the field it is there to exercise', () => {
  for (const c of INVALID_CASES) {
    const result = validateSection(c.where, c.values)
    assert.equal(result.ok, false, `${c.where} / ${c.what}: passed validation and should not have`)
    const keys = Object.keys(result.errors)
    assert.ok(
      keys.includes(c.expect),
      `${c.where} / ${c.what}: refused on ${keys.join(', ') || 'nothing'} instead of "${c.expect}"`
    )
  }
})

test('every case points at a section that exists', () => {
  const sections = [1, 2, 3, 'hours', 'services', 'telma']
  for (const c of INVALID_CASES) {
    assert.ok(sections.includes(c.where), `${c.what}: "${c.where}" is not a section`)
  }
})

test('and the sign-ups that should go through, do', () => {
  // The three the end-to-end page offers. One of them, the porting fixture,
  // had been failing on a missing `forward_type` since the field became
  // required, so the run it belongs to could never have reached the database.
  for (const [name, values] of [
    ['validSignup', validSignup('x')],
    ['portingSignup', portingSignup('x')],
    ['spanishSignup', spanishSignup('x')],
  ]) {
    for (const section of [1, 2, 3]) {
      const result = validateSection(section, values)
      assert.equal(
        result.ok,
        true,
        `${name} fails section ${section}: ${result.ok ? '' : JSON.stringify(result.errors)}`
      )
    }
  }
})

test('the two Portuguese runs are not the same run twice', () => {
  // They differ on the one answer that costs money: 'all' sends Telma every
  // call instead of the overflow, which spends a 250 minute plan in days.
  assert.notEqual(validSignup('x').forward_type, portingSignup('x').forward_type)
})
