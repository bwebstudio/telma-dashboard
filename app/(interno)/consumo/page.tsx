import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, Stat, SectionTitle } from '@/components/ui'
import { formatEuro, currentMonthKey } from '@/lib/format'
import { VOICE_COST_PER_MINUTE } from '@/lib/plans'
import type { Clinic, Usage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ConsumoPage() {
  const { locale, dict } = await getDict()
  const t = dict.interno
  const supabase = await createClient()

  const [clinicsRes, usageRes] = await Promise.all([
    supabase.from('clinics').select('*'),
    supabase.from('usage').select('*').eq('month', currentMonthKey()),
  ])

  const clinics = (clinicsRes.data ?? []) as Clinic[]
  const usage = (usageRes.data ?? []) as Usage[]
  const usageByClinic = new Map(usage.map((u) => [u.clinic_id, u]))

  const totalCalls = usage.reduce((s, u) => s + u.calls_count, 0)
  const totalMinutes = usage.reduce((s, u) => s + Number(u.minutes), 0)
  const estCost = totalMinutes * VOICE_COST_PER_MINUTE
  const contracted = clinics.reduce((s, c) => s + c.minute_limit, 0)

  // Sorted by minutes, because minutes are what the plans meter and what the
  // voice provider bills. Calls are still shown, as the readable figure.
  const rows = clinics
    .map((c) => ({ clinic: c, u: usageByClinic.get(c.id) }))
    .sort((a, b) => Number(b.u?.minutes ?? 0) - Number(a.u?.minutes ?? 0))

  return (
    <>
      <PageHeader eyebrow={dict.internoNav.consumo} title={t.consumoTitle} subtitle={t.consumoSubtitle} />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.totalCalls} value={totalCalls} />
        <Stat
          label={t.totalMinutes}
          value={Math.round(totalMinutes)}
          hint={`${contracted} ${dict.common.of} limite`}
        />
        <Stat label={t.estimatedCost} value={formatEuro(estCost, locale)} />
        <Stat label={dict.internoNav.clinicas} value={clinics.length} />
      </div>

      <SectionTitle>{t.perClinic}</SectionTitle>
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <th className="label-caps px-4 py-3">{t.colName}</th>
              <th className="label-caps px-4 py-3">{t.totalCalls}</th>
              <th className="label-caps px-4 py-3">{t.totalMinutes}</th>
              <th className="label-caps px-4 py-3">{t.estimatedCost}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ clinic, u }) => (
              <tr key={clinic.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{clinic.name}</td>
                <td className="px-4 py-3 text-ink-soft">{u?.calls_count ?? 0}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {Math.round(Number(u?.minutes ?? 0))} / {clinic.minute_limit}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {formatEuro(Number(u?.minutes ?? 0) * VOICE_COST_PER_MINUTE, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
