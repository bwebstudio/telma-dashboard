import { maxLanguagesOnOffer, signupLanguages, signupPlans } from '@/lib/actions/onboarding'
import { SIGNUP_PLANS, type SignupPlan as SignupPlanId } from '@/lib/onboarding/catalog'
import { isDemo } from '@/lib/demo/config'
import { copyFor } from '@/lib/onboarding/copy'
import { resolveOnboardingLocale } from '@/lib/onboarding/locale-server'
import { stripeConfigured } from '@/lib/onboarding/stripe-client'

import { LocaleToggle } from '@/components/onboarding/LocaleToggle'
import { WizardForm } from '@/components/onboarding/WizardForm'

/**
 * Where a clinic signs itself up.
 *
 * The price list is read on the server and handed down, rather than fetched by
 * the form once it mounts. It is the one thing on this page that must never be
 * wrong, and a number that appears a moment after the card it belongs to is a
 * number somebody reads mid-change.
 */

// Prices come from the database, so this cannot be a static page.
export const dynamic = 'force-dynamic'

export default async function InscricaoPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string; lang?: string; implantacao?: string }>
}) {
  const { plano, lang, implantacao } = await searchParams
  // `?lang=` wins, then this browser's saved choice, then Accept-Language.
  const locale = await resolveOnboardingLocale(lang)
  const t = copyFor(locale)
  const [plans, languages, maxLanguages] = await Promise.all([
    signupPlans(),
    signupLanguages(locale),
    maxLanguagesOnOffer(),
  ])

  // The landing's price cards link here with the plan they belong to, so the
  // last step opens on the one already chosen. Anything unrecognised is ignored
  // rather than trusted: this is a query string, and it decides what is billed.
  const initialPlan = SIGNUP_PLANS.includes(plano as SignupPlanId)
    ? (plano as SignupPlanId)
    : null

  // "Demo" here means nothing will actually be charged: either the whole app is
  // running without Supabase, or Stripe has no key yet. Either way the form
  // must say so rather than imply a card will be taken.
  const demo = isDemo() || !stripeConfigured()

  return (
    <div className="flex flex-col gap-10">
      {/* Above the title, because somebody reading a heading in a language they
          do not speak has already decided about this page by the time a switch
          further down would have reached them. */}
      {/* The implementation code rides along: changing language reloads this
          page, and losing it there would quietly take the week away from a
          clinic that was promised one. */}
      <LocaleToggle
        locale={locale}
        next={`/inscricao${
          [
            initialPlan ? `plano=${initialPlan}` : '',
            implantacao ? `implantacao=${encodeURIComponent(implantacao)}` : '',
          ]
            .filter(Boolean)
            .reduce((q, part, i) => (i === 0 ? `?${part}` : `${q}&${part}`), '')
        }`}
      />

      {/* No rule here. The step indicator under it is already a horizontal
          line with the steps drawn on it, so a hairline directly above was
          two separators stacked and the heading ended up fenced off from the
          thing it introduces. The air does the separating. */}
      <WizardForm
        plans={plans}
        demo={demo}
        initialPlan={initialPlan}
        implementationCode={implantacao ?? null}
        locale={locale}
        languages={languages}
        maxLanguages={maxLanguages}
        intro={
          <div>
            <p className="eyebrow eyebrow-mark mb-3">{t.pageTitle}</p>
            <h1 className="h-display text-3xl sm:text-4xl">{t.intro}</h1>
            <p className="mt-3 max-w-lead text-lg text-ink-soft">{t.introLead}</p>
          </div>
        }
      />
    </div>
  )
}
