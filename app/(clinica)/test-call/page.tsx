import { notFound } from 'next/navigation'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader } from '@/components/ui'
import { MockCallForm } from '@/components/clinic/MockCallForm'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import { mockCallsEnabled } from '@/lib/mock-call'

export const dynamic = 'force-dynamic'

/**
 * A call, without a phone.
 *
 * It runs the same three steps the voice agent runs, against the same
 * functions, so what comes out the other end is a real booking in the agenda
 * and real minutes on the meter. That is the point: a demo that wrote its own
 * rows would prove nothing, and a QA run that skipped `record_call` would test
 * the wrong code.
 *
 * Not in production. A simulated call spends minutes a clinic pays for and
 * leaves a booking its receptionist would answer for.
 */
export default async function TestCallPage() {
  if (!mockCallsEnabled()) notFound()

  const { locale, dict } = await getDict()
  const { clinicId, clinic } = await requireClinicContext()
  const billing = await getClinicWithPlan(clinicId)
  const t = dict.testCall

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow={dict.clinicNav.testCall} title={t.title} subtitle={t.subtitle} />

      {/* What the agent is about to read. Shown first because every outcome
          below follows from it: a plan with no minutes left cannot book, and
          somebody watching this should see that coming. */}
      <dl className="card mb-6 flex flex-col gap-2 p-5 text-base">
        <Row label={t.stateClinic} value={clinic?.name ?? '·'} />
        <Row label={t.statePlan} value={clinic ? dict.plans[clinic.plan] : '·'} />
        {billing && (
          <>
            <Row
              label={t.stateMinutes}
              value={`${Math.round(billing.minutes.used)} / ${billing.minutes.allowance}`}
            />
            <Row
              label={t.stateAddons}
              value={billing.addons.length > 0 ? billing.addons.join(', ') : t.stateNoAddons}
            />
          </>
        )}
      </dl>

      <p className="mb-6 rounded-input bg-warn-soft px-4 py-3 text-base text-warn">{t.warning}</p>

      <MockCallForm dict={dict} locale={locale} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
