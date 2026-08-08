import Link from 'next/link'
import { copyFor } from '@/lib/onboarding/copy'
import { resolveOnboardingLocale } from '@/lib/onboarding/locale-server'

/**
 * Where Stripe sends the browser back to.
 *
 * It deliberately knows very little. The clinic was created before checkout
 * began and the subscription is confirmed by the webhook, not by this page: a
 * success URL is just a redirect and anyone can open it, so treating it as
 * proof of payment would mean anyone could activate a clinic by visiting a URL.
 *
 * It also does not show the temporary password. That was shown once, on the
 * screen that produced it, and it went out by email. Putting it on a page
 * reachable from browser history would undo that decision.
 */
export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; lang?: string }>
}) {
  const { session_id, lang } = await searchParams
  const locale = await resolveOnboardingLocale(lang)
  const t = copyFor(locale)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow eyebrow-mark mb-3">{t.doneEyebrow}</p>
        <h1 className="h-display text-3xl sm:text-4xl">{t.thanksTitle}</h1>
        <p className="mt-3 max-w-lead text-lg text-ink-soft">
{t.thanksLead}
        </p>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-ink">{t.doneNextTitle}</h2>
        <ol className="mt-3 flex flex-col gap-2.5">
          {t.doneNext.map((line, i) => (
            <li key={line} className="flex gap-3 text-base text-ink-soft">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-brand-wash text-sm font-medium text-brand-accent">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/login" className="btn-primary">
          {t.doneOpenPanel}
        </Link>
        <span className="text-sm text-ink-mute">
          {t.thanksNoEmail}{' '}
          <a href="mailto:ola@telmaatende.com" className="text-brand-accent underline">
            ola@telmaatende.com
          </a>
          .
        </span>
      </div>

      {/* Useful to quote in a support message, and harmless: a checkout session
          id identifies the payment without granting anything. */}
      {session_id && (
        <p className="text-sm text-ink-mute">
          {t.thanksReference} <span className="text-ink-soft">{session_id}</span>
        </p>
      )}
    </div>
  )
}
