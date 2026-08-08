import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { copyFor } from '@/lib/onboarding/copy'
import { resolveOnboardingLocale } from '@/lib/onboarding/locale-server'

/**
 * The public shell.
 *
 * Deliberately not the panel's `Shell`: this is the one screen in the app a
 * person reaches before they have an account, so there is no navigation to
 * draw, nothing to sign out of, and nowhere else to go. What it does have is a
 * way back to the site, because somebody halfway through a sign-up who wants to
 * re-read the price list should not have to use the back button.
 */

export const metadata: Metadata = {
  title: 'Inscrição · Telma',
  description: 'Inscreva a sua clínica na Telma em seis passos.',
  // Not indexed. The landing sells; this is the thing the landing links to,
  // and a wizard in search results is a wizard entered from the middle.
  robots: { index: false, follow: false },
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://telmaatende.com'

export default async function InscricaoLayout({ children }: { children: React.ReactNode }) {
  // The layout has no access to the page's search params, so it follows the
  // cookie and the browser. A reader who forced `?lang=` gets a header one
  // language behind for exactly one navigation, which is the cheapest honest
  // trade here: the alternative is a client component around the whole shell.
  const locale = await resolveOnboardingLocale()
  const t = copyFor(locale)
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-app items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href={SITE} aria-label="Telma">
            <Logo height={26} />
          </a>
          <Link href="/login" className="text-sm text-ink-soft hover:text-brand-accent">
            {t.haveAccount}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-app flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-ink-mute sm:px-8">
          <span>{t.byBweb}</span>
          <span className="flex gap-4">
            <a href={`${SITE}/${locale}/termos`} className="hover:text-brand-accent">
              {t.legalTerms}
            </a>
            <a href={`${SITE}/${locale}/privacidade`} className="hover:text-brand-accent">
              {t.legalPrivacy}
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
