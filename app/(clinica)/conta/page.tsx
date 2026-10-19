import { requireClinicContext } from '@/lib/clinic-context'
import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { ClinicIdentityForm } from '@/components/clinic/ClinicIdentityForm'
import { clinicProfileValues } from '@/lib/clinic-profile'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'
import { ErasureForm } from '@/components/clinic/ErasureForm'
import { BrandingForm } from '@/components/clinic/BrandingForm'
import { ForwardingCard } from '@/components/clinic/ForwardingCard'
import { ConfirmationModeConfig } from '@/components/clinic/ConfirmationModeConfig'
import { PreAppointmentHoldConfig } from '@/components/clinic/PreAppointmentHoldConfig'
import { LanguagesSection } from '@/components/clinic/LanguagesSection'
import { clinicLanguageSettings } from '@/lib/actions/clinic-settings'

export const dynamic = 'force-dynamic'

/**
 * What this clinic is, and how Telma answers for it.
 *
 * The plan, the invoices and the subscription moved to their own page, and
 * the password to a third: one screen holding all of it meant the thing
 * somebody came for was always below the fold of something else.
 *
 * ── THE ROWS PAIR OR THEY SPAN ────────────────────────────────────────────
 * Both cards in the first row are guarded by the same condition, so they
 * arrive together or not at all, and everything after them spans the width. A
 * two column grid whose cards appear on different conditions leaves empty
 * halves, which read as something that failed to load rather than as space.
 */
export default async function ContaPage() {
  const { locale, dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const onboardingLocale = isOnboardingLocale(locale) ? locale : DEFAULT_ONBOARDING_LOCALE
  const supabase = await createClient()

  const [languageSettings, pendingRes] = await Promise.all([
    clinicLanguageSettings(clinicId),
    // Only how many. The switch to automatic confirmation is blocked while
    // anybody is still waiting for an answer, and the number is what the
    // explanation says out loud. See ConfirmationModeConfig.
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente'),
  ])
  const pendingCount = pendingRes.count ?? 0

  return (
    <>
      <PageHeader eyebrow={dict.conta.accountMenu} title={dict.conta.title} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {clinic && (
          <>
            <section className="card p-6">
              <SectionTitle>{dict.conta.clinicData}</SectionTitle>
              {/* The name, the number and the plan still change by talking to
                  us: one is on the contract, one is a line somebody bought and
                  one is billing. The email and where the clinic is do not, and
                  they moved off the Telma screen, which is about how she
                  answers and had no business asking. */}
              <dl className="flex flex-col gap-3">
                <Field label={dict.common.name} value={clinic.name} />
                <Field label={dict.common.phone} value={clinic.phone} />
                <Field label={dict.conta.plan} value={dict.plans[clinic.plan]} />
              </dl>
              <p className="mt-4 text-sm text-ink-mute">{dict.conta.contactSupport}</p>

              <div className="mt-6 border-t border-line pt-6">
                <ClinicIdentityForm
                  profile={clinicProfileValues(clinic)}
                  copy={dict.clinicIdentity}
                  locale={onboardingLocale}
                  readOnly={readOnly}
                />
              </div>
            </section>

            <section className="card p-6">
              <SectionTitle>{dict.conta.modeTitle}</SectionTitle>
              <ConfirmationModeConfig
                autoConfirm={clinic.appointments_auto_confirmed ?? false}
                pendingCount={pendingCount}
                readOnly={readOnly}
                dict={dict}
              />

              {/* ── ONLY WHILE SOMEBODY IS WAITING ────────────────────────
                  What happens to a booking that has not been answered is a
                  question about a wait. With Telma confirming there is no
                  wait, and the section sat here configuring one: a setting
                  that does nothing is worse than a setting that is missing,
                  because somebody changes it and believes something. */}
              {!clinic.appointments_auto_confirmed && (
                <div className="mt-6 border-t border-line pt-6">
                  <SectionTitle>{dict.conta.holdTitle}</SectionTitle>
                  <PreAppointmentHoldConfig
                    autoExpires={clinic.pre_appointment_auto_expires ?? true}
                    holdMinutes={clinic.pre_appointment_hold_minutes ?? 30}
                    readOnly={readOnly}
                    dict={dict}
                  />
                </div>
              )}
            </section>
          </>
        )}

        <div className="lg:col-span-2">
          <LanguagesSection
            languages={languageSettings.languages}
            selected={languageSettings.selected}
            base={languageSettings.base}
            max={languageSettings.max}
            readOnly={readOnly}
            labels={{
              ...dict.languagesSection,
              save: dict.common.save,
              saving: dict.common.saving,
              saved: dict.common.saved,
              error: dict.common.errorGeneric,
              readOnly: dict.billing.readOnly,
            }}
          />
        </div>

        {/* Kept here for good, with no "done" button, because this is where
            somebody comes back to it: a change of operator, a new handset, or
            a receptionist who cancelled every forward on the line by dialling
            ##002# for an unrelated reason. On the agenda it is a task and goes
            away; here it is reference and stays. */}
        {clinic?.phone_source === 'ported' && clinic.assigned_phone && (
          <div className="lg:col-span-2">
            <ForwardingCard
              telmaNumber={clinic.assigned_phone}
              ownNumber={clinic.porting_details?.current_number ?? null}
              forwardType={clinic.porting_details?.forward_type ?? null}
              dict={dict}
            />
          </div>
        )}

        {/* How the panel looks is the clinic's own decision, so it sits in the
            clinic's own screen rather than in a settings menu somewhere. The
            administrator visiting the panel sees it and cannot change it. */}
        {!readOnly && clinic && (
          <section className="card p-6 lg:col-span-2">
            <SectionTitle>{dict.conta.brandingTitle}</SectionTitle>
            <BrandingForm
              logoUrl={clinic.logo_url ?? null}
              clinicName={clinic.name}
              theme={clinic.theme === 'dark' ? 'dark' : 'light'}
              dict={dict}
            />
          </section>
        )}

        <section className="lg:col-span-2">
          <SectionTitle>{dict.erasure.title}</SectionTitle>
          <div className="card mt-5 p-5 sm:p-6">
            <ErasureForm dict={dict} />
          </div>
        </section>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right text-ink">{value || '·'}</dd>
    </div>
  )
}
