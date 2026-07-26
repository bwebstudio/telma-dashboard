import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, Badge } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import type { ActivityEvent, Clinic } from '@/lib/types'

export const dynamic = 'force-dynamic'

const tone = (type: string) =>
  type === 'limit_warning' ? 'warn' : type === 'appointment_rejected' ? 'danger' : 'neutral'

export default async function AtividadePage() {
  const { locale, dict } = await getDict()
  const t = dict.interno
  const supabase = await createClient()

  const [actRes, clinicsRes] = await Promise.all([
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('clinics').select('id, name'),
  ])

  const events = (actRes.data ?? []) as ActivityEvent[]
  const clinicName = new Map(
    ((clinicsRes.data ?? []) as Pick<Clinic, 'id' | 'name'>[]).map((c) => [c.id, c.name])
  )

  return (
    <>
      <PageHeader eyebrow={dict.internoNav.atividade} title={t.atividadeTitle} subtitle={t.atividadeSubtitle} />

      {events.length === 0 ? (
        <EmptyState>{t.atividadeEmpty}</EmptyState>
      ) : (
        <div className="card divide-y divide-line">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Badge tone={tone(e.type)}>{t.eventTypes[e.type] ?? e.type}</Badge>
                <span className="text-base text-ink">
                  {e.clinic_id ? clinicName.get(e.clinic_id) ?? '' : ''}
                </span>
              </div>
              <span className="text-sm text-ink-mute">{formatDateTime(e.created_at, locale)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
