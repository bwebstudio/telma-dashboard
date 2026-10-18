// Registers the `@/` alias resolver. See scripts/alias-hooks.mjs.
//
//   node --experimental-strip-types --import ./scripts/resolve-alias.mjs --test ...

import { register } from 'node:module'

register('./alias-hooks.mjs', import.meta.url)
