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

const { resolveDuration, keepChosen } = await import('../lib/service-duration.ts')

const CLINIC = {
  // What the clinic offers, and separately the lengths it bothered to set.
  // Those are different lists on purpose: most clinics set no lengths at all,
  // and a service still has to be recognisable by name when they have not.
  services: ['est_laser', 'dent_consulta', 'dent_implantes'],
  service_durations: { est_laser: 45, dent_consulta: 20 },
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
    services: ['dent_consulta', 'est_consulta'],
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
  // Offered, but with no length set: the usual appointment, and still
  // recognised as that service so the panel can colour it.
  const known = resolveDuration(CLINIC, 'implantes')
  assert.equal(known.service_id, 'dent_implantes')
  assert.equal(known.minutes, 30)
})

test('short words never match, or everything would match', () => {
  // "de", "una", "el". Without the length floor these hit every service.
  const r = resolveDuration(CLINIC, 'de una')
  assert.equal(r.service_id, null)
})

// The sign-up stores a length only for services the clinic actually offers.
// A length left behind by a service unticked on the way through would sit in
// the record invisibly and come back if that service were ever ticked again.
test('lengths belong to the services that were chosen', () => {
  const kept = keepChosen({ est_laser: 45, dent_implantes: 90 }, ['est_laser'])
  assert.deepEqual(kept, { est_laser: 45 })
  assert.deepEqual(keepChosen({ est_laser: 45 }, []), {})
  assert.deepEqual(keepChosen(null, ['est_laser']), {})
})

test('a sign-up that never opens the durations panel is still valid', () => {
  // The one that matters most: the clinic run by one person, who books
  // everything in the same slot and must never meet this screen.
  const r = resolveDuration({ service_durations: {}, appointment_duration_minutes: 30 }, 'láser')
  assert.equal(r.minutes, 30)
  assert.equal(r.service_id, null)
})

// A clinic offering something the catalogue has never heard of still puts a
// price on it. Those rows are keyed by the typed line, so a prune that only
// knew about catalogue ids would wipe the price of every custom service.
test('a service typed by hand keeps its price', () => {
  const kept = keepChosen(
    { est_laser: 45, 'Masaje descontracturante': 60, Fantasma: 10 },
    ['est_laser'],
    'Masaje descontracturante\nOtra cosa\n\n'
  )
  assert.deepEqual(kept, { est_laser: 45, 'Masaje descontracturante': 60 })
})

// Colours, which is what the panel actually shows.
const { bookingCategory, CATEGORY_COUNT } = await import('../lib/service-colour.ts')

test('the same treatment gets the same colour however it was said', () => {
  // A caller says "the laser" one week and "laser hair removal" the next. Both
  // match the service, so both land on the same colour: that is the whole
  // reason for colouring by service rather than by the words.
  const a = bookingCategory(resolveDuration(CLINIC, 'el láser').service_id, 'el láser')
  const b = bookingCategory(resolveDuration(CLINIC, 'Depilación láser').service_id, 'Depilación láser')
  assert.equal(a.index, b.index)
  assert.equal(a.key, 'est_laser')
})

test('a reason no catalogue knows still gets a colour of its own', () => {
  // Clinics write down what people actually come in for, and half of it is in
  // nobody's catalogue. Giving all of that one grey left most weeks looking
  // exactly as they did before any of this, which is what happened first time.
  const cat = bookingCategory(null, 'revisión del gato')
  assert.ok(cat && cat.index >= 1 && cat.index <= CATEGORY_COUNT)
  assert.ok(bookingCategory(null, 'vacuna anual').index >= 1)
  // Nothing written down is nothing to colour by, and the chip stays neutral.
  assert.equal(bookingCategory(null, '   '), null)
  assert.equal(bookingCategory(null, null), null)
})

test('punctuation and accents do not split one reason into two colours', () => {
  assert.equal(
    bookingCategory(null, 'Revisión del gato.').key,
    bookingCategory(null, 'revision del gato').key
  )
})

// The two guarantees that do not depend on Telma getting it right.
//
// Two weeks of rewriting a rule moved "does not ask for the phone twice" from
// zero in ten to five, and never further. The lesson from the one change that
// did work — taking the question away — generalises: for anything that must be
// reliable, make the failure impossible rather than discouraged.
const { canonicalReason } = await import('../lib/service-duration.ts')

test('the reason stored is the clinic\'s service, or nothing at all', () => {
  const clinic = { services: ['dent_limpeza', 'dent_implantes'], custom_services: 'Blanqueamiento LED' }

  // Said any way at all, it lands on the clinic's own wording.
  assert.equal(canonicalReason(clinic, 'una limpieza'), 'Limpieza / tartrectomía')
  assert.equal(canonicalReason(clinic, 'quiero implantes'), 'Implantes')
  assert.equal(canonicalReason(clinic, 'Blanqueamiento LED'), 'Blanqueamiento LED')

  // And what the clinic does not offer, or what somebody said about their
  // body, is not stored at all. An appointment with no reason is a question
  // the clinic asks; a wrong reason is a booking that looks fine until the
  // patient arrives, and a symptom is health data with a retention period.
  assert.equal(canonicalReason(clinic, 'me duele mucho la muela de arriba y sangra'), null)
  assert.equal(canonicalReason(clinic, 'una logopeda para mi bebé'), null)
  assert.equal(canonicalReason(clinic, null), null)
})

const { phoneForAppointment } = await import('../lib/phone.ts')

test('a booking is never lost for want of a number the network already has', () => {
  // What she took, when it looks whole.
  assert.equal(phoneForAppointment('+34 644 111 222', '+34910555000'), '+34 644 111 222')

  // Seven national digits where Spain uses nine: this exact number cost a real
  // booking once. Now it falls back instead of discarding the appointment.
  assert.equal(phoneForAppointment('+345578891', '+34644111222'), '+34644111222')
  assert.equal(phoneForAppointment(null, '+34644111222'), '+34644111222')
  assert.equal(phoneForAppointment('', '+34644111222'), '+34644111222')

  // A withheld number and a misheard one in the same call is the only case
  // left with nothing to store, and it is the one that should still refuse.
  assert.equal(phoneForAppointment('345', null), null)
})
