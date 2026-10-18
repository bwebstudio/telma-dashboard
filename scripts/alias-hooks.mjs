// The `@/` alias, for node.
//
// tsconfig maps `@/*` to the repo root. Node knows nothing about it, so a
// module that imports through the alias could not be loaded by a test even
// when it is three pure functions. The alternative was writing such modules
// without imports, the way lib/onboarding/done-state.ts is written, but
// lib/clinic-setup.ts has to share `isRealProviderRef` with the rest of the
// product: a second copy of the rule that decides whether a clinic has a real
// telephone number is exactly the kind of thing that drifts unnoticed.
//
// Loaded by scripts/resolve-alias.mjs, which is what a test passes to
// `node --import`.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)

/** The alias is written without a file extension, which node requires. */
function withExtension(url) {
  if (/\.[a-z]+$/.test(url)) return url
  for (const candidate of [`${url}.ts`, `${url}.tsx`, `${url}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) return candidate
  }
  return url
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(withExtension(new URL(specifier.slice(2), root).href), context)
  }
  // TypeScript writes relative imports without an extension too, and a module
  // reached through the alias then imports its neighbours that way.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL) {
      const resolved = withExtension(new URL(specifier, context.parentURL).href)
      if (resolved !== new URL(specifier, context.parentURL).href) {
        return next(resolved, context)
      }
    }
  }
  return next(specifier, context)
}
