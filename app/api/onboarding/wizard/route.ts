import { NextResponse } from 'next/server'
import { submitWizardStep } from '@/lib/actions/onboarding'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'

/**
 * Saving one step, over HTTP.
 *
 * The form itself does not use this: it calls the server action directly, which
 * is one fewer hop and one fewer thing to keep in sync. This exists for what
 * cannot call a server action, which today is the end to end test page and
 * tomorrow may be a partner site embedding the sign-up.
 *
 * Same validation, same store, same everything: it is a thin wrapper over
 * `submitWizardStep` on purpose. A second implementation is a second set of
 * rules, and the second one is always the one that is out of date.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { step?: unknown; data?: unknown; token?: unknown; locale?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, errors: { _form: 'JSON inválido.' } }, { status: 400 })
  }

  const step = Number(body.step)
  const token = typeof body.token === 'string' ? body.token : null

  // The language the messages come back in. Taken from the body, or from the
  // payload itself, since `locale` is one of step 1's answers and travels with
  // the rest of them. Without this a Spanish applicant gets Portuguese
  // validation errors, which is exactly the bug this route existed to not have.
  const fromData = (body.data as { locale?: unknown } | null | undefined)?.locale
  const locale = isOnboardingLocale(body.locale)
    ? body.locale
    : isOnboardingLocale(fromData)
      ? fromData
      : DEFAULT_ONBOARDING_LOCALE

  const state = await submitWizardStep(step, body.data, token, locale)

  // 422 rather than 400 for a payload that arrived intact and failed the rules:
  // a caller retrying on 400 would be right to, and wrong to here.
  return NextResponse.json(state, { status: state.ok ? 200 : 422 })
}
