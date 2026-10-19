import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { ClinicIdentityForm } from '@/components/clinic/ClinicIdentityForm'
import { clinicProfileValues } from '@/lib/clinic-profile'
import { DEFAULT_ONBOARDING_LOCALE, isOnboardingLocale } from '@/lib/onboarding/locale'
import { ErasureForm } from '@/components/clinic/ErasureForm'
import { BrandingForm } from '@/components/clinic/BrandingForm'
import { BillingLive } from '@/components/clinic/BillingLive'
import { MinutesProgressCard } from '@/components/clinic/MinutesProgressCard'
import { ForwardingCard } from '@/components/clinic/ForwardingCard'
import { BillingPortalButton } from '@/components/clinic/BillingPortalButton'
import { PlanSection } from '@/components/clinic/PlanSection'
import { ConfirmationModeConfig } from '@/components/clinic/ConfirmationModeConfig'
import { PreAppointmentHoldConfig } from '@/components/clinic/PreAppointmentHoldConfig'
import { AddonsSection } from '@/components/clinic/AddonsSection'
import { LanguagesSection } from '@/components/clinic/LanguagesSection'
import { clinicLanguageSettings } from '@/lib/actions/clinic-settings'
import { PurchaseHistoryTable } from '@/components/clinic/PurchaseHistoryTable'
import { getClinicWithPlan, getMinutePackOffer, listAddonOffers } from '@/lib/clinic-utils'
import type { Purchase } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ContaPage() {
  const { locale, dict } = await getDict()
  const { user, clinicId, clinic, readOnly } = await requireClinicContext()
  const onboardingLocale = isOnboardingLocale(locale) ? locale : DEFAULT_ONBOARDING_LOCALE
  const supabase = await createClient()

  const [billing, pack, purchasesRes, pendingRes] = await Promise.all([
    getClinicWithPlan(clinicId),
    getMinutePackOffer(),
    // Through the session client, not the service role: this is the clinic
    // reading its own receipts, and the policy that says so should be the thing
    // enforcing it.
    supabase
      .from('purchases')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('purchased_at', { ascending: false })
      .limit(50),
    // Only how many. The switch to automatic confirmation is blocked while
    // anybody is still waiting for an answer, and the number is what the
    // explanation says out loud. See ConfirmationModeConfig.
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente'),
  ])

  const addons = billing ? await listAddonOffers(billing) : []
  const purchases = (purchasesRes.data ?? []) as Purchase[]
  const pendingCount = pendingRes.count ?? 0
  const languageSettings = await clinicLanguageSettings(clinicId)

  return (
    <>
      <BillingLive clinicId={clinicId} />
      <PageHeader eyebrow={dict.clinicNav.conta} title={dict.conta.title} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle>{dict.conta.clinicData}</SectionTitle>
          {/* The name, the number and the plan still change by talking to us:
              one is on the contract, one is a line somebody bought and one is
              billing. The email and where the clinic is do not, and they moved
              off the Telma screen, which is about how she answers and had no
              business asking. */}
          <dl className="flex flex-col gap-3">
            <Field label={dict.common.name} value={clinic?.name} />
            <Field label={dict.common.phone} value={clinic?.phone} />
            <Field label={dict.conta.plan} value={clinic ? dict.plans[clinic.plan] : undefined} />
          </dl>
          <p className="mt-4 text-sm text-ink-mute">{dict.conta.contactSupport}</p>

          {clinic && (
            <div className="mt-6 border-t border-line pt-6">
              <ClinicIdentityForm
                profile={clinicProfileValues(clinic)}
                copy={dict.clinicIdentity}
                locale={onboardingLocale}
                readOnly={readOnly}
              />
            </div>
          )}
        </section>

        {/* The same card as the agenda's, on purpose. Two drawings of one
            number is how a panel ends up telling a clinic two different things
            about how many minutes it has left. */}
        {billing && (
          <MinutesProgressCard
            minutes={billing.minutes}
            pack={pack}
            canBuy={!readOnly}
            dict={dict}
            locale={locale}
          />
        )}

        {billing && (
          <PlanSection
            clinic={billing.clinic}
            plan={billing.plan}
            minutes={billing.minutes}
            dict={dict}
            locale={locale}
          />
        )}

        {/* Next to the plan rather than buried in a settings menu: it changes
            what the clinic sees on its agenda every day, so it belongs where
            the clinic reads about itself. */}
        {/* Kept here for good, with no "done" button, because this is where
            somebody comes back to it: a change of operator, a new handset, or
            a receptionist who cancelled every forward on the line by dialling
            ##002# for an unrelated reason. On the agenda it is a task and goes
            away; here it is reference and stays. */}
        {/* ── THE PASSWORD HAS A DOOR NOW ──────────────────────────────
            /nova-palavra-passe existed and worked for anybody already signed
            in, and nothing in the panel linked to it. The only route somebody
            would find unaided was "I forgot my password", which means asking
            for a recovery email to change a password they already know. */}
        <section className="card p-6">
          <SectionTitle>{dict.conta.accessTitle}</SectionTitle>
          <dl className="mb-4 flex flex-col gap-3">
            <Field label={dict.common.email} value={user?.email} />
          </dl>
          <p className="mb-4 max-w-prose text-base text-ink-soft">{dict.conta.accessHelp}</p>
          <Link href="/nova-palavra-passe" className="btn-secondary inline-flex">
            {dict.conta.changePassword}
          </Link>
        </section>

        {/* Invoices, card and cancellation: one door, hosted by Stripe and
            wearing our name. Building the invoice screen ourselves would be a
            second version of a legal document, and the first time it
            disagreed with theirs it would be in front of an accountant. */}
        <section className="card p-6">
          <SectionTitle>{dict.billingPortal.title}</SectionTitle>
          <p className="mb-4 max-w-prose text-base text-ink-soft">{dict.billingPortal.help}</p>
          <BillingPortalButton
            label={dict.billingPortal.open}
            opening={dict.billingPortal.opening}
            failed={dict.billingPortal.failed}
            readOnly={readOnly}
          />
        </section>

        {clinic?.phone_source === 'ported' && clinic.assigned_phone && (
          <ForwardingCard
            telmaNumber={clinic.assigned_phone}
            ownNumber={clinic.porting_details?.current_number ?? null}
            forwardType={clinic.porting_details?.forward_type ?? null}
            dict={dict}
          />
        )}

        {clinic && (
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

        {addons.length > 0 && (
          <div className="lg:col-span-2">
            <AddonsSection addons={addons} canBuy={!readOnly} dict={dict} locale={locale} />
          </div>
        )}

        <div className="lg:col-span-2">
          <PurchaseHistoryTable purchases={purchases} dict={dict} locale={locale} />
        </div>

        {/* How the panel looks is the clinic's own decision, so it sits in the
            clinic's own screen rather than in a settings menu somewhere. The
            administrator visiting the panel sees it and cannot change it. */}
        {!readOnly && clinic && (
          <section className="card p-6 lg:col-span-2">
            <SectionTitle>{dict.conta.brandingTitle}</SectionTitle>
            <p className="mb-6 text-base text-ink-soft">{dict.conta.brandingHelp}</p>
            <BrandingForm
              logoUrl={clinic.logo_url}
              clinicName={clinic.name}
              accent={clinic.accent}
              dict={dict}
            />
          </section>
        )}

        <section className="mt-12">
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
