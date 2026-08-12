#!/usr/bin/env node
//
// The dictionary has to survive being handed to a client component.
//
//   npm run test:content
//
// Every page in the panel passes `dict` whole across the server/client
// boundary. React serialises it, and a function does not serialise: the page
// throws "Functions cannot be passed directly to Client Components" while
// rendering, on the server, and the browser is shown a digest with no message.
//
// That is what happened when two entries were written as `(n, total) => ...`
// because a template read better than a string with holes in it. Every other
// entry in the file had always been a string, so nothing had ever caught it,
// and the whole hours page went down in production.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Imported one by one rather than through content/index.ts, whose imports have
// no file extensions and so cannot be resolved by node on its own. Changing
// those for the benefit of a test would be the tail wagging the dog.
const dictionaries = Object.fromEntries(
  await Promise.all(
    ['pt', 'es', 'en'].map(async (code) => [code, (await import(`../content/${code}.ts`))[code]])
  )
)

/** Every leaf, with the path that reaches it. */
function* leaves(value, path = []) {
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* leaves(v, [...path, i])
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* leaves(v, [...path, k])
  } else {
    yield [path.join('.'), value]
  }
}

for (const [locale, dict] of Object.entries(dictionaries)) {
  test(`the ${locale} dictionary can cross to a client component`, () => {
    for (const [path, value] of leaves(dict)) {
      assert.notEqual(
        typeof value,
        'function',
        `${locale}.${path} is a function. Use a string with {placeholders} and fill it at the call site.`
      )
      // The same boundary refuses these, for the same reason and with the same
      // unreadable error.
      assert.ok(
        ['string', 'number', 'boolean'].includes(typeof value) || value === null,
        `${locale}.${path} is a ${typeof value}, which does not serialise`
      )
    }
  })
}
