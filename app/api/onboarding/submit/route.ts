import { NextResponse } from 'next/server'
import { completeOnboarding } from '@/lib/actions/onboarding'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'

/**
 * Finishing the sign-up, over HTTP.
 *
 * The counterpart to the wizard route, and the same reasoning: the form calls
 * the action, this exists for callers that cannot.
 *
 * The password is in this response. That is unavoidable, since the whole point
 * is to hand back credentials for an account that has just been created, and it
 * is why the response is marked no-store: a temporary password sitting in a
 * proxy cache would outlive the thirty seconds it is meant to be useful for.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { token?: unknown; wizardData?: unknown; locale?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, errors: { _form: 'JSON inválido.' } }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : null
  // Only a fallback: `completeOnboarding` prefers the language stored in the
  // draft, which is the one the six steps were actually filled in.
  const locale = isOnboardingLocale(body.locale) ? body.locale : DEFAULT_ONBOARDING_LOCALE
  const state = await completeOnboarding(token, body.wizardData, locale)

  return NextResponse.json(state, {
    status: state.ok ? 201 : 422,
    headers: { 'Cache-Control': 'no-store' },
  })
}
