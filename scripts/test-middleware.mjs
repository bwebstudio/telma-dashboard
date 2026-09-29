#!/usr/bin/env node
//
// Which routes the session middleware is allowed to touch.
//
//   npm run test:middleware
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Three times now, a route that authenticates with a token instead of a user
// session has been added without being added to the middleware's exclusion
// list, and every time the symptom was the same: a 307 to /login, to a caller
// that is not a browser and cannot follow it.
//
//   api/clinic-context   would have failed on the first real call
//   api/service-check    caught by a browser check
//   api/cron             the reminder run, which silently sent nothing
//
// The third one is the reason this is a test and not a fourth comment. It had no
// symptom: the job ran, was redirected, and reported success at doing nothing.
//
// So the list is checked against the routes rather than read. A route that holds
// its own door open with a secret must not be behind the session door as well;
// one that does not must be.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const API = join(here, '..', 'app', 'api')

/** The matcher, as a regex, exactly as Next compiles it. */
function matcher() {
  const src = readFileSync(join(here, '..', 'middleware.ts'), 'utf8')
  const found = src.match(/matcher:\s*\[\s*'([^']+)'/)
  assert.ok(found, 'the matcher is no longer a single quoted string in middleware.ts')
  // The string is written for Next's path matcher and doubles its backslashes
  // inside a JS string literal, which reading the file gives back verbatim.
  return new RegExp(`^${found[1]}$`)
}

/** Every route.ts under app/api, as the path it answers on. */
function routes(dir = API, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routes(full, found)
    else if (entry === 'route.ts') {
      found.push({
        path:
          '/api/' +
          relative(API, dir)
            .split(/[\\/]/)
            .filter(Boolean)
            .join('/'),
        source: readFileSync(full, 'utf8'),
      })
    }
  }
  return found
}

// A route that checks a shared secret out of the environment is a route called
// by something that has no session: the voice platform, or Vercel's scheduler.
const OWN_DOOR = /CRON_SECRET|WEBHOOK_TOKEN|TELMA_TOKEN/

test('a route with its own door is not behind the session door', () => {
  const m = matcher()
  const all = routes()
  assert.ok(all.length > 5, 'no routes found: this test is looking in the wrong place')

  for (const route of all) {
    if (!OWN_DOOR.test(route.source)) continue
    // A concrete request path, because a dynamic segment is matched as one.
    const asked = route.path.replace(/\[[^\]]+\]/g, 'x')
    assert.ok(
      !m.test(asked),
      `${asked} authenticates with a secret and is still matched by the middleware, `
        + 'so whatever calls it gets a 307 to /login it cannot follow. '
        + 'Add its prefix to the matcher in middleware.ts.'
    )
  }
})

// The other direction, which is the one that would quietly open a door. Every
// route the middleware is told to skip has to have a reason to be skipped.
test('nothing is excluded without a reason to be', () => {
  const src = readFileSync(join(here, '..', 'middleware.ts'), 'utf8')
  const found = src.match(/\(\?!([^)]+)\)/)
  assert.ok(found, 'the matcher has changed shape')
  const excluded = found[1]
    .split('|')
    .filter((p) => p.startsWith('api/'))
    .map((p) => `/${p}`)

  const all = routes()
  for (const prefix of excluded) {
    const under = all.filter((r) => r.path.startsWith(prefix))
    assert.ok(under.length > 0, `${prefix} is excluded from the middleware and no longer exists`)
    // Every route under an excluded prefix either holds its own door, or is one
    // the platform is documented as calling unauthenticated. There is no third
    // kind, and a route that ends up here by accident is a route with no door at
    // all.
    for (const route of under) {
      const guarded =
        OWN_DOOR.test(route.source) ||
        // The diary and the availability the voice platform reads, which are
        // scoped by a clinic id it was given at the start of the call.
        /clinic_id|clinicId|p_clinic_id/.test(route.source)
      assert.ok(guarded, `${route.path} is outside the session door and checks nothing`)
    }
  }
})
