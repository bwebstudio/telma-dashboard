import { createAdminClient } from '@/lib/supabase/admin'
import { isDemo } from '@/lib/demo/config'
import type { StepNumber } from './wizard-schema'

/**
 * Where a half-finished sign-up lives.
 *
 * Two stores behind one interface. With Supabase configured it is the
 * `onboarding_sessions` table, written with the service role because the
 * applicant has no account and therefore no RLS identity. In demo mode it is a
 * Map on globalThis, for the same reason lib/demo/overrides.ts is: server
 * actions and pages compile into separate module graphs, so a module-level
 * object is two objects, and only globalThis is actually shared.
 *
 * The browser also keeps a copy in localStorage. That is the fast path, and it
 * is deliberately not the only one: localStorage does not survive the customer
 * finishing on their phone what they started on the desktop, and it is not
 * somewhere the sales team can see that a sign-up stalled on step 4.
 */

export interface Draft {
  token: string
  data: Record<string, unknown>
  currentStep: number
  completedAt: string | null
  clinicId: string | null
}

const KEY = Symbol.for('telma.onboarding.drafts')

function memory(): Map<string, Draft> {
  const g = globalThis as unknown as Record<symbol, Map<string, Draft>>
  return (g[KEY] ??= new Map())
}

/**
 * An opaque token for a sign-up nobody has authenticated.
 *
 * It is a bearer credential for whatever the applicant has typed so far, so it
 * is a full uuid rather than something short and guessable, and it never
 * appears in a URL: it lives in localStorage and in the request body. A token
 * in the address bar ends up in browser history, in a screenshot sent to
 * support, and in the referer header of the first outbound link.
 */
export function newToken(): string {
  return crypto.randomUUID()
}

/** Tokens we minted look like this. Rejecting the rest keeps junk out of the
 *  table and makes the unique index mean something. */
export function isToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

export async function readDraft(token: string): Promise<Draft | null> {
  if (!isToken(token)) return null

  if (isDemo()) return memory().get(token) ?? null

  const admin = createAdminClient()
  const { data } = await admin
    .from('onboarding_sessions')
    .select('token, data, current_step, completed_at, clinic_id')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null
  return {
    token: data.token,
    data: (data.data ?? {}) as Record<string, unknown>,
    currentStep: data.current_step ?? 0,
    completedAt: data.completed_at ?? null,
    clinicId: data.clinic_id ?? null,
  }
}

/**
 * Merges one step's validated answers into the draft.
 *
 * `currentStep` only ever moves forward. Somebody going back to fix their email
 * has not un-answered steps two through five, and a naive `current_step = step`
 * would tell the sales team a sign-up regressed every time it was corrected.
 */
export async function saveStep(
  token: string,
  step: StepNumber,
  values: Record<string, unknown>
): Promise<Draft> {
  const existing = await readDraft(token)
  const merged = { ...(existing?.data ?? {}), ...values }
  const currentStep = Math.max(existing?.currentStep ?? 0, step)

  const draft: Draft = {
    token,
    data: merged,
    currentStep,
    completedAt: existing?.completedAt ?? null,
    clinicId: existing?.clinicId ?? null,
  }

  if (isDemo()) {
    memory().set(token, draft)
    return draft
  }

  const admin = createAdminClient()
  const { error } = await admin.from('onboarding_sessions').upsert(
    {
      token,
      data: merged,
      current_step: currentStep,
    },
    { onConflict: 'token' }
  )
  if (error) throw new Error(error.message)
  return draft
}

/** Ties the draft to what it produced, and stops it expiring. */
export async function markCompleted(token: string, clinicId: string): Promise<void> {
  const now = new Date().toISOString()

  if (isDemo()) {
    const draft = memory().get(token)
    if (draft) memory().set(token, { ...draft, completedAt: now, clinicId })
    return
  }

  const admin = createAdminClient()
  await admin
    .from('onboarding_sessions')
    .update({ completed_at: now, clinic_id: clinicId })
    .eq('token', token)
}
