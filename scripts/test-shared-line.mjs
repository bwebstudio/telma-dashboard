#!/usr/bin/env node
//
// One line, many clinics, and still one diary per call.
//
//   npm run test:shared-line
//
// Not in `npm test`: it talks to the real database and writes rows, like
// test-idempotency.mjs. It cleans up after itself and checks that it did.
//
// What it proves is the half of 0059 that lives in the database rather than in
// TypeScript. These are unique indexes and check constraints, which means they
// hold against anything that writes -- the sign-up, the panel, a script, a
// person in the SQL editor at midnight -- and that is the whole reason they
// were written as indexes instead of as a rule in the code. A test that only
// called our own functions would prove nothing about any of those.
//
// Read .env.local for the service key, the way the other integration scripts do.

import { readFileSync } from 'node:fs'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(URL_BASE && KEY, 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed')

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body }
}

const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })

/** Everything this test creates carries it, so cleanup cannot miss a row. */
const MARK = `shared-line-test-${Date.now()}`
let sharedNumber = null
let sharedDigits = null

async function makeClinic(fields) {
  return rest('clinics?select=id', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: MARK,
      contact_email: `${MARK}@example.invalid`,
      status: 'por_configurar',
      // The minimum a clinic row insists on. Not the point of this test, but
      // a check constraint that fires first hides the one being measured.
      selected_languages: ['pt'],
      language: 'pt',
      ...fields,
    }),
  })
}

before(async () => {
  const { body } = await rpc('shared_line_for', { p_country: 'PT' })
  sharedNumber = body?.[0]?.number ?? null
  sharedDigits = sharedNumber ? sharedNumber.replace(/[^\d]/g, '') : null
})

after(async () => {
  const { status } = await rest(`clinics?name=eq.${encodeURIComponent(MARK)}`, { method: 'DELETE' })
  assert.ok(status < 300, `cleanup failed with ${status}: rows named ${MARK} are still there`)
  const left = await rest(`clinics?name=eq.${encodeURIComponent(MARK)}&select=id`)
  assert.equal(left.body?.length ?? 0, 0, 'the test left clinics behind')
})

test('there is a shared line, and it is on the shelf for good', async () => {
  assert.ok(sharedNumber, 'shared_line_for(PT) returned nothing')
  const { body } = await rest(
    `phone_stock?number=eq.${encodeURIComponent(sharedNumber)}&select=shared,clinic_id,claimed_at`
  )
  assert.equal(body[0].shared, true)
  assert.equal(body[0].clinic_id, null, 'the shared line was claimed by a clinic')
  assert.equal(body[0].claimed_at, null)
})

test('a shared line cannot be claimed, however it is written', async () => {
  const { ok, body } = await rest(
    `phone_stock?number=eq.${encodeURIComponent(sharedNumber)}`,
    { method: 'PATCH', body: JSON.stringify({ claimed_at: new Date().toISOString() }) }
  )
  assert.equal(ok, false, 'the database let the shared line be claimed')
  assert.match(JSON.stringify(body), /phone_stock_shared_is_never_claimed/)
})

test('a second clinic may answer on the shared line', async () => {
  const r = await makeClinic({ assigned_phone: sharedNumber, assigned_phone_shared: true })
  assert.equal(r.ok, true, `sharing was refused: ${JSON.stringify(r.body)}`)
})

test('but only one of them owns what is dialled directly', async () => {
  // Sorriso already owns the direct calls on this line.
  const r = await makeClinic({
    assigned_phone: sharedNumber,
    assigned_phone_shared: true,
    answers_direct_calls: true,
  })
  assert.equal(r.ok, false, 'two clinics were allowed to own direct calls on one line')
  assert.match(JSON.stringify(r.body), /idx_clinics_shared_line_direct_owner/)
})

test('and owning them without sharing the line is meaningless, so it is refused', async () => {
  const r = await makeClinic({
    assigned_phone: '+351999000111',
    assigned_phone_shared: false,
    answers_direct_calls: true,
  })
  assert.equal(r.ok, false)
  assert.match(JSON.stringify(r.body), /clinics_direct_calls_needs_shared_line/)
})

test('a line a clinic has to itself is still its own', async () => {
  const own = '+351999000222'
  const first = await makeClinic({ assigned_phone: own })
  assert.equal(first.ok, true, `the first clinic was refused: ${JSON.stringify(first.body)}`)
  const second = await makeClinic({ assigned_phone: own })
  assert.equal(second.ok, false, 'two clinics were allowed on one exclusive line')
  assert.match(JSON.stringify(second.body), /idx_clinics_exclusive_line/)
})

test('a direct call resolves to the declared owner and to nobody else', async () => {
  const { body } = await rpc('clinic_by_dialled_number', { p_number: sharedNumber })
  assert.ok(body, 'a direct call to the shared line resolved to nothing')

  const { body: owner } = await rest(
    `clinics?id=eq.${body}&select=name,answers_direct_calls,assigned_phone_digits`
  )
  assert.equal(owner[0].answers_direct_calls, true)
  assert.equal(owner[0].assigned_phone_digits, sharedDigits)
  assert.notEqual(owner[0].name, MARK, 'it resolved to one of this test’s clinics')
})

test('a number nobody answers on resolves to nothing, rather than to somebody', async () => {
  const { body } = await rpc('clinic_by_dialled_number', { p_number: '+351999888777' })
  assert.equal(body, null)
})

// ── AND THE CLINIC THAT LEFT ───────────────────────────────────────────────
// Cancelling is not something the telephone network is told about. The forward
// a clinic dialled months ago keeps working, and its patients keep arriving on
// the shared line. Whose call that is has to stay answerable after the clinic
// has gone, because a call that matches nothing does not stop: it falls
// through to the number dialled, which on a shared line is whichever clinic
// declared it answers direct calls. See migration 0066.

/** The id of a row this test made. `rest` overrides the Prefer header, so an
 *  insert never hands one back and it is read afterwards instead. */
async function idOf(phone) {
  const { body } = await rest(`clinics?select=id&name=eq.${encodeURIComponent(MARK)}&phone=eq.${encodeURIComponent(phone)}`)
  return body?.[0]?.id ?? null
}

test('a forward that outlives the clinic is still recognised as theirs', async () => {
  const left = '+351999000333'
  const { ok, body } = await makeClinic({
    status: 'cancelada',
    phone: left,
    assigned_phone: sharedNumber,
    assigned_phone_shared: true,
    porting_details: { current_number: left, forward_type: 'no_answer' },
  })
  assert.equal(ok, true, `the clinic was refused: ${JSON.stringify(body)}`)
  const gone = await idOf(left)
  assert.ok(gone, 'the fixture was not written')

  // Who may claim it: nobody, which is right. A cancelled clinic does not get
  // to answer calls.
  const claim = await rpc('clinic_by_own_number', { p_number: left })
  assert.equal(claim.body, null, 'a cancelled clinic was allowed to claim a call')

  // Who it belongs to: them, which is what stops the call falling through to
  // the owner of the shared line and into a different clinic's diary.
  const attributed = await rpc('clinic_by_own_number_any_status', { p_number: left })
  assert.equal(attributed.body, gone, 'the call was not attributed to the clinic that left')

  const owner = await rpc('clinic_by_dialled_number', { p_number: sharedNumber })
  assert.notEqual(
    attributed.body,
    owner.body,
    'the former client\u2019s call resolved to the clinic that answers the shared line'
  )
})

test('a live clinic wins the same digits over one that left', async () => {
  const shared = '+351999000444'
  const gone = await makeClinic({
    status: 'cancelada',
    phone: shared,
    assigned_phone: sharedNumber,
    assigned_phone_shared: true,
  })
  assert.equal(gone.ok, true, `the fixture was refused: ${JSON.stringify(gone.body)}`)
  const goneId = await idOf(shared)

  const live = await makeClinic({
    status: 'ativa',
    phone: shared,
    assigned_phone: sharedNumber,
    assigned_phone_shared: true,
  })
  assert.equal(live.ok, true, `the fixture was refused: ${JSON.stringify(live.body)}`)

  const { body } = await rpc('clinic_by_own_number_any_status', { p_number: shared })
  assert.ok(body, 'nobody was found for digits two clinics carry')
  assert.notEqual(body, goneId, 'the clinic that left took a live clinic\u2019s call')
})
