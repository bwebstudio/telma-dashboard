#!/usr/bin/env node
//
// Turning what the caller said into how long to leave in the diary.
//
//   npm run test:duration
//
// The clinic configures minutes against service ids. The caller says "el
// láser". Nothing in between is exact, so what matters is which way it is wrong
// when it is wrong: a slot of the usual length, offered, beats no slot at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { resolveDuration } = await import('../lib/service-duration.ts')

const CLINIC = {
  service_durations: { est_laser: 45, est_limpeza: 60, dent_consulta: 20 },
  appointment_duration_minutes: 30,
}

test('the service the caller named, however they named it', () => {
  for (const said of ['Depilación láser', 'depilacao laser', 'DEPILACION LASER']) {
    assert.equal(resolveDuration(CLINIC, said).minutes, 45, said)
  }
})

test('a distinctive word is enough, because nobody says the whole label', () => {
  // What people actually say down a telephone.
  assert.equal(resolveDuration(CLINIC, 'el láser').service_id, 'est_laser')
  assert.equal(resolveDuration(CLINIC, 'vengo para el laser de las piernas').minutes, 45)
})

test('an ambiguous word falls back rather than guessing', () => {
  // A dental valuation and an aesthetic one are both "Consulta de valoración",
  // which is exactly why the catalogue keeps them as separate ids. Picking the
  // first listed would be wrong half the time and wrong invisibly.
  const ambiguous = {
    ...CLINIC,
    service_durations: { dent_consulta: 20, est_consulta: 45 },
  }
  const r = resolveDuration(ambiguous, 'una consulta de valoración')
  assert.equal(r.service_id, null)
  assert.equal(r.minutes, 30, 'the clinic default, not one of the two')
})

test('nothing said, nothing configured, nothing clever', () => {
  assert.equal(resolveDuration(CLINIC, null).minutes, 30)
  assert.equal(resolveDuration(CLINIC, '').minutes, 30)
  assert.equal(resolveDuration(CLINIC, 'para hablar con el doctor').minutes, 30)
  // A clinic that has never opened the durations screen behaves exactly as it
  // did before any of this existed.
  assert.equal(resolveDuration({ appointment_duration_minutes: 30 }, 'láser').minutes, 30)
})

test('short words never match, or everything would match', () => {
  // "de", "una", "el". Without the length floor these hit every service.
  const r = resolveDuration(CLINIC, 'de una')
  assert.equal(r.service_id, null)
})
