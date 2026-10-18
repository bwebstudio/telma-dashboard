#!/usr/bin/env node
//
// The three states of a clinic that has signed up and is not answering yet.
//
//   npm run test:setup-gate
//
// The list that stands between "signed up" and "answering" gained a third step
// -- the Telma number being real -- and the third one is not the clinic's to
// do. That changed two screens and the server action behind them, and the
// failure it caused was silent: a clinic finished all five steps of the wizard,
// pressed "activate", and was told to try again, for ever, because the thing
// missing was a number Twilio had not sold us yet.
//
// So what is checked here is the state machine itself, not the pixels: which
// steps are outstanding, whether activation is allowed, and whether the step
// has anywhere to send the reader. A step with no link has to carry a reason
// instead, which is why the dictionary is checked in the same breath.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { setupSteps, readyToActivate } = await import('../lib/clinic-setup.ts')
const { pt } = await import('../content/pt.ts')
const { es } = await import('../content/es.ts')
const { en } = await import('../content/en.ts')

/** What the sign-up leaves behind when Twilio has not given a number. */
const NO_NUMBER = 'PNdemo9258b24b164641339022ac900c'
const REAL_NUMBER = 'PN2b0f6e5a4c1d47f0a9e8c7b6a5d4e3f2'

const ids = (steps) => steps.map((s) => s.id)
const pending = (steps) => steps.filter((s) => !s.done).map((s) => s.id)

test('nothing done: all three outstanding, and no activating', () => {
  const steps = setupSteps(
    { services: [], custom_services: '', phone_provider_ref: NO_NUMBER },
    0
  )
  assert.deepEqual(ids(steps), ['hours', 'services', 'number'])
  assert.deepEqual(pending(steps), ['hours', 'services', 'number'])
  assert.equal(readyToActivate(steps), false)
})

test('their part done, the number not: only the number is left, and still no activating', () => {
  const steps = setupSteps(
    { services: ['est_consulta'], custom_services: '', phone_provider_ref: NO_NUMBER },
    5
  )
  assert.deepEqual(pending(steps), ['number'])
  assert.equal(readyToActivate(steps), false)
})

test('everything done: activating is allowed', () => {
  const steps = setupSteps(
    { services: ['est_consulta'], custom_services: '', phone_provider_ref: REAL_NUMBER },
    5
  )
  assert.deepEqual(pending(steps), [])
  assert.equal(readyToActivate(steps), true)
})

test('a service typed by hand counts as a service', () => {
  const steps = setupSteps(
    { services: [], custom_services: 'Limpeza dentária\n  \n', phone_provider_ref: REAL_NUMBER },
    5
  )
  assert.deepEqual(pending(steps), [])
})

test('the one step that is not theirs has nowhere to send them', () => {
  const steps = setupSteps({ services: [], custom_services: '', phone_provider_ref: null }, 0)
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]))
  assert.ok(byId.hours.href, 'hours has somewhere to go')
  assert.ok(byId.services.href, 'services has somewhere to go')
  assert.equal(byId.number.href, '', 'the number is ours to get, not theirs')
})

test('every step has a label, and the stepless one has a reason instead of a link', () => {
  for (const [lang, dict] of [
    ['pt', pt],
    ['es', es],
    ['en', en],
  ]) {
    for (const id of ['hours', 'services', 'number']) {
      const label = dict.setup.steps[id]
      assert.equal(typeof label, 'string', `${lang}.setup.steps.${id} is a string`)
      assert.ok(label.trim().length > 3, `${lang}.setup.steps.${id} says something`)
    }
    assert.ok(
      dict.setup.waitingNumber.trim().length > 10,
      `${lang}.setup.waitingNumber explains the wait`
    )
    assert.ok(
      dict.setupWizard.activateNoNumber.trim().length > 10,
      `${lang}.setupWizard.activateNoNumber explains the refusal`
    )
  }
})

test('neither screen still promises two things, now that there are three', () => {
  const twoish = [/duas coisas/i, /dos cosas/i, /two things/i, /dois passos/i, /dos pasos/i, /both steps/i]
  for (const [lang, dict] of [
    ['pt', pt],
    ['es', es],
    ['en', en],
  ]) {
    const prose = [dict.setup.lead, dict.setup.leadKeep, dict.setup.notYet].join(' | ')
    for (const pattern of twoish) {
      assert.equal(pattern.test(prose), false, `${lang} still counts: ${pattern} in ${prose}`)
    }
  }
})

test('the refusal a clinic cannot act on does not tell it to try again', () => {
  for (const [lang, dict] of [
    ['pt', pt],
    ['es', es],
    ['en', en],
  ]) {
    const m = dict.setupWizard.activateNoNumber
    for (const pattern of [/tente novamente/i, /int[eé]ntelo/i, /try again/i]) {
      assert.equal(pattern.test(m), false, `${lang} sends them round the loop: ${m}`)
    }
  }
})
