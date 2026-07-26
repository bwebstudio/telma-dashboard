import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, Badge } from '@/components/ui'
import { IconPlus, IconSearch, IconChevron } from '@/components/icons'
import { currentMonthKey, formatDate } from '@/lib/format'
import type { Clinic, Usage, ActivityEvent, ClinicStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const statusTone: Record<ClinicStatus, 'ok' | 'warn' | 'danger'> = {
  ativa: 'ok',
  pausada: 'warn',
  cancelada: 'danger',
}

export default async function ClinicasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const { locale, dict } = await getDict()
  const t = dict.interno
  const supabase = await createClient()

  let clinicsQuery = supabase.from('clinics').select('*').order('name')
  if (q) clinicsQuery = clinicsQuery.ilike('name', `%${q}%`)

  const [clinicsRes, usageRes, actRes] = await Promise.all([
    clinicsQuery,
    supabase.from('usage').select('*').eq('month', currentMonthKey()),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500),
  ])

  const clinics = (clinicsRes.data ?? []) as Clinic[]
  const usageByClinic = new Map((usageRes.data as Usage[] | null)?.map((u) => [u.clinic_id, u]) ?? [])
  const lastActivity = new Map<string, string>()
  for (const a of (actRes.data as ActivityEvent[] | null) ?? []) {
    if (a.clinic_id && !lastActivity.has(a.clinic_id)) lastActivity.set(a.clinic_id, a.created_at)
  }

  return (
    <>
      <PageHeader
        eyebrow={dict.internoNav.clinicas}
        title={t.clinicsTitle}
        subtitle={t.clinicsSubtitle}
        action={
          <Link href="/clinicas/nova" className="btn-primary">
            <IconPlus className="h-5 w-5" />
            {t.newClinic}
          </Link>
        }
      />

      <form method="GET" className="mb-6 flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">
            <IconSearch className="h-5 w-5" />
          </span>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder={t.searchPlaceholder}
            className="field-input pl-10"
          />
        </div>
        <button className="btn-secondary" type="submit">
          {dict.common.search}
        </button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line bg-paper-2">
              <Th>{t.colName}</Th>
              <Th>{t.colPlan}</Th>
              <Th>{t.colStatus}</Th>
              <Th>{t.colUsage}</Th>
              <Th className="hidden md:table-cell">{t.colActivity}</Th>
              <th />
            </tr>
          </thead>
          <tbody>
            {clinics.map((c) => {
              const used = usageByClinic.get(c.id)?.calls_count ?? 0
              const pct = c.call_limit > 0 ? (used / c.call_limit) * 100 : 0
              const over = pct >= 100
              const near = pct >= 80 && pct < 100
              const act = lastActivity.get(c.id)
              return (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper-2/60">
                  <Td>
                    <Link href={`/clinicas/${c.id}`} className="font-medium text-ink hover:text-accent">
                      {c.name}
                    </Link>
                  </Td>
                  <Td>{dict.plans[c.plan]}</Td>
                  <Td>
                    <Badge tone={statusTone[c.status]}>{dict.status.clinic[c.status]}</Badge>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className={over ? 'font-semibold text-danger' : near ? 'font-semibold text-warn' : 'text-ink'}>
                        {used} / {c.call_limit}
                      </span>
                      {over && <Badge tone="danger">{t.overLimit}</Badge>}
                      {near && <Badge tone="warn">{t.nearLimit}</Badge>}
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell text-ink-mute">
                    {act ? formatDate(act, locale) : t.never}
                  </Td>
                  <Td>
                    <Link href={`/clinicas/${c.id}`} className="inline-flex text-ink-mute hover:text-accent">
                      <IconChevron className="h-5 w-5" />
                    </Link>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`label-caps px-4 py-3 ${className}`}>{children}</th>
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}
