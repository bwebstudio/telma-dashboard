import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { SetupWizard } from '@/components/clinic/SetupWizard'
import { SetupChecklist } from '@/components/clinic/SetupChecklist'
import { clinicProfileValues } from '@/lib/clinic-profile'
import { slotsToSimple } from '@/lib/onboarding/schedule'
import { signupLanguages } from '@/lib/actions/onboarding'
import { clinicLanguageSettings } from '@/lib/actions/clinic-settings'
import { isOnboardingLocale, DEFAULT_ONBOARDING_LOCALE } from '@/lib/onboarding/locale'
import { setupSteps } from '@/lib/clinic-setup'
import type { AvailabilitySlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The first morning, and a screen of its own.
 *
 * ── WHY IT IS NOT THE AGENDA ──────────────────────────────────────────────
 * It was. A clinic that had just paid opened the panel, read "Agenda" at the
 * top, and found "when is the clinic open?" underneath: the chrome of a
 * product in use wrapped around the form that comes before using it. Every
 * screen in a panel makes one promise, and the agenda's is what is happening
 * today. A form is not that.
 *
 * So setting up has its own address, its own entry at the top of the sidebar
 * while it lasts, and it is where logging in lands until it is done. The
 * agenda goes back to being the agenda.
 *
 * ── AND WHY IT SAYS SHE IS NOT ANSWERING, TWICE ───────────────────────────
 * The question a clinic has on this screen is not "where is everything". It
 * is "is she already talking to my patients?". Nothing on the old screen
 * answered it, so it had to be inferred from an empty agenda -- and inferring
 * that wrong, in either direction, is the kind of thing that loses a client
 * in the first week.
 */
export default async function ComecarPage() {
  const { locale, dict } = await getDict()
  const { clinicId, clinic } = await requireClinicContext()

  // Nothing to set up any more. Somebody who kept the link, or came back a
  // month later, goes where the product actually lives.
  if (clinic?.status !== 'por_configurar') redirect('/hoje')

  const supabase = await createClient()
  const [slotsRes, { count: openDays }] = await Promise.all([
    supabase.from('availability_slots').select('*').eq('clinic_id', clinicId),
    supabase
      .from('availability_slots')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId),
  ])

  const steps = setupSteps(clinic, openDays ?? 0)
  const onboardingLocale = isOnboardingLocale(locale) ? locale : DEFAULT_ONBOARDING_LOCALE

  return (
    <>
      <SetupChecklist steps={steps} clinicName={clinic.name} dict={dict} />

      <SetupWizard
        // The profile plus the timetable. `clinicProfileValues` maps the
        // clinic row, and the hours are not on it: they are rows in
        // availability_slots, read back into the three groups this screen
        // asks about. Without this the first step opens blank and saving it
        // would wipe the week the sign-up created.
        initial={{
          ...clinicProfileValues(clinic),
          ...slotsToSimple((slotsRes.data ?? []) as AvailabilitySlot[]),
        }}
        locale={onboardingLocale}
        languages={await signupLanguages(onboardingLocale)}
        languageSettings={await clinicLanguageSettings(clinicId)}
        dict={dict}
        hasHours={(openDays ?? 0) > 0}
      />
    </>
  )
}
