import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader } from '@/components/ui'
import { TelmaSettingsForm } from '@/components/clinic/TelmaSettingsForm'
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

  // The clinic row, in the shape the sign-up's fields expect. Mapped here rather
  // than renaming columns, because the wizard's names are what its schemas and
  // its components already agree on.
  const initial: Record<string, unknown> = {
    clinic_name: clinic.name ?? '',
    address: clinic.address ?? '',
    phone: clinic.phone ?? '',
    specialty: clinic.specialty ?? '',
    region: clinic.region ?? '',
    services: clinic.services ?? [],
    // So the panel opens showing the lengths already in force rather than
    // blank boxes that would quietly wipe them on the next save.
    service_durations: clinic.service_durations ?? {},
    custom_services: clinic.custom_services ?? '',
    price_info: clinic.price_info ?? '',
    appointment_duration_minutes: clinic.appointment_duration_minutes ?? 30,
    formality: clinic.formality ?? 'formal',
    fallback_policy: clinic.fallback_policy ?? 'message',
    fallback_number: clinic.fallback_number ?? '',
    briefing: clinic.briefing ?? '',
    emergency_number: clinic.emergency_number ?? '',
    emergency_protocol: clinic.emergency_protocol ?? '',
    after_hours_transfer: clinic.after_hours_transfer === true,
    after_hours_number: clinic.after_hours_number ?? '',
    after_hours_patients_only: clinic.after_hours_patients_only !== false,
    calls_recorded: clinic.calls_recorded !== false,
    selected_languages: clinic.selected_languages ?? [clinic.language ?? 'pt'],
    greeting_language: clinic.language ?? 'pt',
  }

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.telma} title={dict.telmaSettings.title} subtitle={dict.telmaSettings.lead} />
      <TelmaSettingsForm
        initial={initial}
        locale={onboardingLocale}
        languages={languages}
        readOnly={readOnly}
      />
    </>
  )
}
