import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { BrandingForm } from '@/components/clinic/BrandingForm'
import { BillingLive } from '@/components/clinic/BillingLive'
import { MinutesProgressCard } from '@/components/clinic/MinutesProgressCard'
import { PlanSection } from '@/components/clinic/PlanSection'
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
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const [billing, pack, purchasesRes] = await Promise.all([
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
  ])

  const addons = billing ? await listAddonOffers(billing) : []
  const purchases = (purchasesRes.data ?? []) as Purchase[]
  const languageSettings = await clinicLanguageSettings(clinicId)

  return (
    <>
      <BillingLive clinicId={clinicId} />
      <PageHeader eyebrow={dict.clinicNav.conta} title={dict.conta.title} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle>{dict.conta.clinicData}</SectionTitle>
          <dl className="flex flex-col gap-3">
            <Field label={dict.common.name} value={clinic?.name} />
            <Field label="Email" value={clinic?.contact_email} />
            <Field label={dict.common.phone} value={clinic?.phone} />
            <Field label={dict.conta.plan} value={clinic ? dict.plans[clinic.plan] : undefined} />
          </dl>
          <p className="mt-5 text-sm text-ink-mute">{dict.conta.contactSupport}</p>
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
        {clinic && (
          <section className="card p-6">
            <SectionTitle>{dict.conta.holdTitle}</SectionTitle>
            <PreAppointmentHoldConfig
              autoExpires={clinic.pre_appointment_auto_expires ?? true}
              readOnly={readOnly}
              dict={dict}
            />
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
              title: locale === 'es' ? 'Idiomas configurados' : 'Idiomas configurados',
              help:
                locale === 'es'
                  ? 'Telma reconoce la lengua de quien llama y responde en ella. Su plan incluye un número de idiomas; elija cuáles.'
                  : 'A Telma reconhece a língua de quem liga e responde nela. O seu plano inclui um número de idiomas; escolha quais.',
              count: locale === 'es' ? '{n} de {max}' : '{n} de {max}',
              base: locale === 'es' ? 'siempre incluido' : 'incluído sempre',
              soon: locale === 'es' ? 'próximamente' : 'em breve',
              full:
                locale === 'es'
                  ? 'Ha llegado al máximo de su plan. Quite uno para elegir otro, o suba de plan.'
                  : 'Chegou ao máximo do seu plano. Retire um para escolher outro, ou suba de plano.',
              save: dict.common.save,
              saving: dict.common.saving,
              saved: dict.common.saved,
              tooMany:
                locale === 'es'
                  ? 'Ha elegido más idiomas de los que incluye su plan.'
                  : 'Escolheu mais idiomas do que o seu plano inclui.',
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
