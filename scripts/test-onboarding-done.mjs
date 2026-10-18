#!/usr/bin/env node
//
// The finished sign-up survives a language change.
//
//   npm run test:onboarding-done
//
// Changing language on the final screen reloads the page. Before this, the
// reload put a clinic that already existed back on step 1 and the temporary
// password, shown only there, was gone. What brings the screen back is
// lib/onboarding/done-state.ts, so that is what this watches: a finished
// sign-up is found again after a reload, and only for as long as it should be.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { saveDone, loadDone, DONE_STORAGE_KEY, DONE_TTL_MS } = await import(
  '../lib/onboarding/done-state.ts'
)

function memoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  }
}

const result = {
  clinicId: 'c1',
  clinicName: 'Clínica Dentária Sorriso',
  email: 'rececao@sorriso.pt',
  password: 'Fv4zyurvCzwe9kuj',
  phoneNumber: null,
  temporaryNumber: true,
  dashboardUrl: 'https://app.telmaatende.com',
  checkoutUrl: null,
  demo: false,
}
const values = { clinic_name: 'Clínica Dentária Sorriso', phone_option: 'keep' }

test('a reload straight after finishing finds the final screen, password included', () => {
  const s = memoryStorage()
  saveDone(s, result, values, 1_000)
  const back = loadDone(s, 1_000 + 5_000)
  assert.ok(back, 'the finished sign-up is gone after a reload')
  assert.equal(back.result.password, result.password)
  assert.equal(back.result.clinicId, result.clinicId)
  assert.deepEqual(back.values, values)
})

test('it does not outlive its time, and is cleared when it expires', () => {
  const s = memoryStorage()
  saveDone(s, result, values, 1_000)
  assert.equal(loadDone(s, 1_000 + DONE_TTL_MS + 1), null)
  assert.equal(s.has(DONE_STORAGE_KEY), false, 'an expired password is left in storage')
})

test('nothing saved, or something unreadable, means the form', () => {
  assert.equal(loadDone(memoryStorage()), null)
  const s = memoryStorage()
  s.setItem(DONE_STORAGE_KEY, '{not json')
  assert.equal(loadDone(s), null)
  s.setItem(DONE_STORAGE_KEY, JSON.stringify({ savedAt: Date.now() }))
  assert.equal(loadDone(s), null)
})

test('blocked storage does not break finishing', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
    removeItem: () => { throw new Error('blocked') },
  }
  assert.doesNotThrow(() => saveDone(blocked, result, values))
  assert.equal(loadDone(blocked), null)
})
