import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader } from '@/components/ui'
import { TelmaSettingsForm } from '@/components/clinic/TelmaSettingsForm'
import { TelmaGuarantees } from '@/components/clinic/TelmaGuarantees'
import { clinicProfileValues } from '@/lib/clinic-profile'
import { signupLanguages } from '@/lib/actions/onboarding'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'

/**
 * What Telma knows about this clinic, and where it gets changed.
 *
 * The sign-up used to be a one-way door: everything a clinic said about itself
 * was written once and could never be corrected. An emergency number that
 * changes, a treatment that gets added, a clinic that moves premises, a dentist
 * who decides to stop being formal — none of it could reach Telma without us
 * doing it by hand in the database.
 *
 * The line this page draws is the same one the prompt draws. Everything the
 * clinic supplied is the clinic's and is editable here. Everything that makes
 * Telma herself — how she opens, that she confirms a name and a number before
 * booking, that she never gives clinical advice, that an emergency outranks
 * every other rule — is ours, versioned with the application, and appears on no
 * screen anybody can edit.
 */

export const dynamic = 'force-dynamic'

export default async function TelmaPage() {
  const { locale, dict } = await getDict()
  const { clinic, readOnly } = await requireClinicContext()
  // requireClinicContext redirects when there is no clinic, so this is only for
  // the type checker's benefit.
  if (!clinic) return null

  const onboardingLocale = isOnboardingLocale(locale) ? locale : DEFAULT_ONBOARDING_LOCALE
  const languages = await signupLanguages(onboardingLocale)

  const initial = clinicProfileValues(clinic)


  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.telma} title={dict.telmaSettings.title} subtitle={dict.telmaSettings.lead} />
      <TelmaSettingsForm
        initial={initial}
        locale={onboardingLocale}
        languages={languages}
        readOnly={readOnly}
      />
      <div className="mt-10">
        <TelmaGuarantees dict={dict} />
      </div>
    </>
  )
}
