import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState } from '@/components/ui'
import { CallItem } from '@/components/CallItem'
import type { Call, CallResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

const RESULTS: CallResult[] = ['marcacao', 'transferida', 'informacao', 'nao_resolvida']

export default async function ChamadasPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; from?: string; to?: string }>
}) {
  const { r, from, to } = await searchParams
  const { locale, dict } = await getDict()
  const supabase = await createClient()

  let query = supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(200)
  if (r && RESULTS.includes(r as CallResult)) query = query.eq('result', r)
  if (from) query = query.gte('created_at', new Date(from).toISOString())
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    query = query.lte('created_at', end.toISOString())
  }

  const { data } = await query
  const calls = (data ?? []) as Call[]

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.chamadas} title={dict.chamadas.title} />

      <form method="GET" className="card mb-6 flex flex-wrap items-end gap-4 p-4 sm:p-5">
        <div>
          <label htmlFor="r" className="field-label">
            {dict.chamadas.filterResult}
          </label>
          <select id="r" name="r" defaultValue={r ?? ''} className="field-input">
            <option value="">{dict.common.all}</option>
            {RESULTS.map((res) => (
              <option key={res} value={res}>
                {dict.status.call[res]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="field-label">
            {dict.chamadas.filterFrom}
          </label>
          <input id="from" name="from" type="date" defaultValue={from ?? ''} className="field-input" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            {dict.chamadas.filterTo}
          </label>
          <input id="to" name="to" type="date" defaultValue={to ?? ''} className="field-input" />
        </div>
        <button type="submit" className="btn-secondary">
          {dict.common.search}
        </button>
      </form>

      {calls.length === 0 ? (
        <EmptyState>{dict.chamadas.empty}</EmptyState>
      ) : (
        <div className="card px-4 sm:px-5">
          {calls.map((call) => (
            <CallItem key={call.id} call={call} dict={dict} locale={locale} withDate />
          ))}
        </div>
      )}
    </>
  )
}
