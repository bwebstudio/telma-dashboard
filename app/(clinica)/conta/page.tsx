import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle, Badge } from '@/components/ui'
import { BrandingForm } from '@/components/clinic/BrandingForm'
import { currentMonthKey } from '@/lib/format'
import type { Usage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ContaPage() {
  const { dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const { data: usageRow } = await supabase
    .from('usage')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('month', currentMonthKey())
    .maybeSingle()
  const usage = usageRow as Usage | null

  const used = Math.round(Number(usage?.minutes ?? 0))
  const limit = clinic?.minute_limit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.conta} title={dict.conta.title} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle>{dict.conta.clinicData}</SectionTitle>
          <dl className="flex flex-col gap-3">
            <Field label={dict.common.name} value={clinic?.name} />
            <Field label={dict.conta.plan} value={clinic ? dict.plans[clinic.plan] : undefined} />
            <Field label="Email" value={clinic?.contact_email} />
            <Field label={dict.common.phone} value={clinic?.phone} />
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-mute">{dict.conta.addon}</dt>
              <dd>
                <Badge tone={clinic?.addon_whatsapp ? 'ok' : 'neutral'}>
                  {clinic?.addon_whatsapp ? dict.conta.addonOn : dict.conta.addonOff}
                </Badge>
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-ink-mute">{dict.conta.contactSupport}</p>
        </section>

        <section className="card p-6">
          <SectionTitle>{dict.conta.usageTitle}</SectionTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-ink">{used}</span>
            <span className="text-lg text-ink-mute">
              {dict.common.of} {limit}
            </span>
          </div>
          <p className="mt-1 text-base text-ink-soft">
            {dict.conta.minutesUsed} {dict.common.thisMonth}
          </p>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-brand-wash">
            <div
              className={`h-full rounded-full ${pct >= 80 ? 'bg-warn' : 'bg-ok'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-mute">
            {dict.conta.limit}: {limit}
          </p>
        </section>

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
