#!/usr/bin/env node
//
// What a reminder says to the patient.
//
//   npm run test:recall-copy
//
// lib/recall-copy.ts imports nothing, which is what makes this possible: the
// sentence somebody reads on a lock screen is checkable without a database, a
// Twilio account or a running application.
//
// The first test is the reason the file exists. Every other claim about these
// messages is a claim about a string assembled in code, and this is where the
// string is held to it.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { recallMessage, segmentsFor, BODY_LIMIT } = await import('../lib/recall-copy.ts')
const { SERVICES, serviceLabel } = await import('../lib/onboarding/catalog.ts')

const SORRISO = { name: 'Clínica Dentária Sorriso', language: 'pt', assigned_phone: '+351300602615' }
const SONRISA = { name: 'Clínica Dental Sonrisa', language: 'es', assigned_phone: '+34910000001' }
const CLINICS = [SORRISO, SONRISA]

// ── THE ONE THAT MATTERS ────────────────────────────────────────────────────
// An SMS arrives on a lock screen, months after the appointment, and the person
// holding the telephone is not always the person it is about. A reminder that
// names the treatment tells a son what was done to his mother.
// The words that are not a treatment, and saying why matters more than the list.
// "consulta" and "cita" mean "an appointment": they are what the message is FOR,
// they appear in the catalogue only because a first appointment is a thing a
// clinic offers, and they give nothing away because everybody who was ever at a
// clinic had one. "implantes", "branqueamento", "ortodontia" are what somebody
// was treated for, and those are what this test exists to keep out.
const NOT_A_TREATMENT = new Set([
  'consulta', 'consultas', 'avaliacao', 'avaliação', 'valoracion', 'valoración',
  'primeira', 'primera', 'revisao', 'revisão', 'revision', 'revisión',
])

test('a reminder never names a treatment', () => {
  const words = new Set()
  for (const list of Object.values(SERVICES)) {
    for (const s of list) {
      for (const locale of ['pt', 'es']) {
        for (const word of serviceLabel(s.id, locale).split(/[\s/]+/)) {
          // Short words are excluded because "de" and "e" appear in ordinary
          // sentences. What is being looked for is "implantes", "branqueamento",
          // "ortodontia": the words that give somebody away.
          const w = word.toLowerCase()
          if (w.length >= 6 && !NOT_A_TREATMENT.has(w)) words.add(w)
        }
      }
    }
  }
  assert.ok(words.size > 20, 'the catalogue is no longer where this test looks')

  for (const clinic of CLINICS) {
    const said = recallMessage(clinic, 'aviso').toLowerCase()
    for (const word of words) {
      assert.ok(!said.includes(word), `the reminder says "${word}"`)
    }
  }
})

test('every reminder names the clinic, first', () => {
  for (const clinic of CLINICS) {
    for (const kind of ['aviso', 'campanha']) {
      const said = recallMessage(clinic, kind, 'uma promoção este mês.')
      assert.ok(said.startsWith(clinic.name), `${kind}: does not open with the clinic`)
    }
  }
})

// Both halves of the same rule: the patient is asked to ring, so the number has
// to be there, and they are told how to stop, so the way to stop has to be
// there. The second one is not optional in either country.
test('every reminder carries the number and a way to stop', () => {
  for (const clinic of CLINICS) {
    for (const kind of ['aviso', 'campanha']) {
      const said = recallMessage(clinic, kind, 'uma promoção este mês.')
      assert.ok(said.includes(clinic.assigned_phone), `${kind}: no number to ring`)
      assert.match(said, /não quiser avisos|no quiere avisos/i, `${kind}: no way to stop it`)
    }
  }
})

test('a clinic with no number still tells the patient to ring', () => {
  const said = recallMessage({ ...SORRISO, assigned_phone: null }, 'aviso')
  assert.match(said, /Ligue-nos/)
  // And does not leave a dangling colon where the number would have been.
  assert.doesNotMatch(said, /:\s*(Se|$)/)
})

test('a campanha with nothing written falls back to the fixed reminder', () => {
  // Rather than sending the clinic's name followed by nothing at all. The server
  // action refuses an empty body before it gets here; this is the floor under it.
  assert.equal(recallMessage(SORRISO, 'campanha', '   '), recallMessage(SORRISO, 'aviso'))
})

test('a clinic that signs its own message is not made to say its name twice', () => {
  const said = recallMessage(SORRISO, 'campanha', 'Clínica Dentária Sorriso: oferta de março.')
  assert.equal(said.indexOf(SORRISO.name), said.lastIndexOf(SORRISO.name))
})

test('a long campanha is cut, not sent whole', () => {
  const said = recallMessage(SORRISO, 'campanha', 'a'.repeat(BODY_LIMIT + 200))
  assert.ok(said.length < BODY_LIMIT + 200, 'the clinic can send an SMS of any length')
})

// The clinic pays per segment and Portuguese and Spanish are full of characters
// that halve the segment. Worth a test because the number is shown to the clinic
// beside the box it writes in, and a wrong number there is worse than none.
test('segments are counted the way Twilio charges for them', () => {
  assert.equal(segmentsFor('a'.repeat(160)), 1)
  assert.equal(segmentsFor('a'.repeat(161)), 2)
  // One accent outside GSM-7 turns the whole thing into UCS-2: 70, not 160.
  assert.equal(segmentsFor('á'.repeat(70)), 1)
  assert.equal(segmentsFor('á'.repeat(71)), 2)
  // "à" and "é" ARE in GSM-7. "á" is not, which is the trap.
  assert.equal(segmentsFor('à'.repeat(160)), 1)
})

test('the messages a clinic actually sends are two segments or fewer', () => {
  for (const clinic of CLINICS) {
    const said = recallMessage(clinic, 'aviso')
    assert.ok(
      segmentsFor(said) <= 2,
      `${clinic.name}: ${segmentsFor(said)} segments for "${said}"`
    )
  }
})
