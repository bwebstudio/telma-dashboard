#!/usr/bin/env node
//
// The screen for somebody who signed in and has nowhere to go.
//
//   npm run test:no-access
//
// It is reached by a role with no panel, which on a showcase deployment is
// every role but the clinic's. Before it existed those accounts were sent back
// to /login by the middleware, saw a valid session, were sent to / , were found
// to have no panel, and were sent back to /login: a loop that ends on the
// sign-in screen, which everybody reads as a wrong password.
//
// Checked here rather than by making an account and looking, which is what this
// page costs to see.
//
// Only the copy. The rule that lands somebody here lives in lib/access.ts,
// whose imports carry no file extensions, so node cannot resolve them without
// a bundler; test-content.mjs says the same about content/index.ts. The rule is
// three lines and has not changed. The copy is what moved in this round, out of
// the component and into the dictionary, and it is what this watches.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const pt = (await import('../content/pt.ts')).pt
const es = (await import('../content/es.ts')).es

test('both languages say it in their own words', () => {
  const keys = ['title', 'demo', 'plain', 'signUp', 'out']
  for (const k of keys) {
    assert.equal(typeof pt.noAccess[k], 'string', `pt.noAccess.${k} missing`)
    assert.equal(typeof es.noAccess[k], 'string', `es.noAccess.${k} missing`)
    assert.ok(pt.noAccess[k].trim().length > 0, `pt.noAccess.${k} empty`)
    assert.ok(es.noAccess[k].trim().length > 0, `es.noAccess.${k} empty`)
  }
  // A Spanish panel showing the Portuguese sentence is the failure this page
  // had for its whole life, while its copy lived inside the component.
  for (const k of ['title', 'demo', 'plain', 'signUp']) {
    assert.notEqual(pt.noAccess[k], es.noAccess[k], `es.noAccess.${k} is the Portuguese one`)
  }
})

test('neither language leaves the other one showing through', () => {
  assert.doesNotMatch(es.noAccess.title + es.noAccess.demo + es.noAccess.plain, /ã|õ|ç|painel/i)
  assert.doesNotMatch(pt.noAccess.title + pt.noAccess.demo + pt.noAccess.plain, /cuenta|aquí|panel de/i)
})
