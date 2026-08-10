import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState } from '@/components/ui'
import { ConversationItem } from '@/components/clinic/ConversationItem'
import { AgendaLive } from '@/components/clinic/AgendaLive'
import type { Call, CallResult, ConversationChannel } from '@/lib/types'

export const dynamic = 'force-dynamic'

const RESULTS: CallResult[] = ['marcacao', 'transferida', 'informacao', 'nao_resolvida']
const CHANNELS: ConversationChannel[] = ['telefone', 'whatsapp']

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; ch?: string; from?: string; to?: string; c?: string }>
}) {
  const { r, ch, from, to, c } = await searchParams
  const { locale, dict } = await getDict()
  const { clinicId, clinic } = await requireClinicContext()
  const supabase = await createClient()

  const tz = clinic?.timezone || 'Europe/Lisbon'
  const hasWhatsapp = Boolean(clinic?.addon_whatsapp)

  let query = supabase
    .from('calls')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (r && RESULTS.includes(r as CallResult)) query = query.eq('result', r)
  if (ch && CHANNELS.includes(ch as ConversationChannel)) query = query.eq('channel', ch)
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
      <AgendaLive clinicId={clinicId} />
      <PageHeader
        eyebrow={dict.clinicNav.chamadas}
        title={dict.conversas.title}
        subtitle={hasWhatsapp ? dict.conversas.subtitle : dict.conversas.subtitleNoWhatsapp}
      />

      <form method="GET" className="card mb-6 flex flex-wrap items-end gap-4 p-4 sm:p-5">
        {/* The channel filter only exists for a clinic that has both. Offering
            a WhatsApp filter to a clinic without the add-on is an empty list
            that reads like a bug. */}
        {hasWhatsapp && (
          <div>
            <label htmlFor="ch" className="field-label">
              {dict.conversas.filterChannel}
            </label>
            <select id="ch" name="ch" defaultValue={ch ?? ''} className="field-input">
              <option value="">{dict.common.all}</option>
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {dict.status.channel[value]}
                </option>
              ))}
            </select>
          </div>
        )}
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
        <EmptyState>{dict.conversas.empty}</EmptyState>
      ) : (
        <div className="card px-4 sm:px-5">
          {calls.map((call) => (
            <ConversationItem
              key={call.id}
              call={call}
              dict={dict}
              locale={locale}
              tz={tz}
              // Arriving from the agenda's "read the conversation" link opens
              // the right one already expanded, instead of leaving somebody to
              // find it in a list of two hundred.
              open={c === call.id}
              withDate
            />
          ))}
        </div>
      )}
    </>
  )
}
