import type { ClinicAccent } from '@/lib/types'

/**
 * What the demo has changed about itself, for as long as the server is up.
 *
 * Demo mode has no database, and the obvious place to keep a change — mutating
 * the seed object in lib/demo/data.ts — does not work: Next compiles server
 * actions and pages into separate module graphs, so the action mutates one copy
 * of the store and the page renders from another. Proven, not assumed: the two
 * report different object identities.
 *
 * globalThis is shared by both, because both run in the same Node process. It
 * is the smallest thing that actually crosses the boundary. Nothing here
 * survives a restart, which is exactly what demo mode promises.
 */
export interface ClinicOverride {
  accent?: ClinicAccent
  logo_url?: string | null
  pre_appointment_auto_expires?: boolean
}

const KEY = Symbol.for('telma.demo.clinicOverrides')

function bag(): Map<string, ClinicOverride> {
  const g = globalThis as unknown as Record<symbol, Map<string, ClinicOverride>>
  return (g[KEY] ??= new Map())
}

export function readClinicOverride(clinicId: string): ClinicOverride {
  return bag().get(clinicId) ?? {}
}

export function writeClinicOverride(clinicId: string, patch: ClinicOverride): void {
  bag().set(clinicId, { ...readClinicOverride(clinicId), ...patch })
}
