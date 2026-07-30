import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  applyFilters,
  byUrgency,
  fetchLastActivities,
  fetchReps,
  fetchVisibleProspects,
  filtersToQuery,
  parseFilters,
  requireCrmSession,
} from '@/lib/crm/data'
import { lateness, smartStamp, tzFor } from '@/lib/crm/time'
import { ProspectCards, type ProspectRow } from '@/components/crm/ProspectCards'
import { ProspectFilters } from '@/components/crm/ProspectFilters'
import { crmStrings } from '@/lib/crm/strings'
import { CrmLive } from '@/components/crm/CrmLive'
import { Badge } from '@/components/ui'
import { IconDownload, IconPlus, IconChevron } from '@/components/icons'
import type { CrmStage } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

const stageTone: Record<CrmStage, 'neutral' | 'pending' | 'ok' | 'warn' | 'danger' | 'info'> = {
  new: 'neutral',
  attempting: 'neutral',
  contacted: 'pending',
  interested: 'pending',
  meeting: 'info',
  won: 'ok',
  lost: 'danger',
}

// The pipeline. Cards on a phone, a dense table on a desktop: the same data,
// but a rep on the street never gets a wide table to scroll sideways.
export default async function ProspetosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const { user, isAdmin, rep, dict, locale } = await requireCrmSession()
  const t = dict.crm
  const supabase = await createClient()

  const [all, reps, lastActivities] = await Promise.all([
    fetchVisibleProspects(supabase),
    fetchReps(supabase),
    fetchLastActivities(supabase),
  ])
  const repName = new Map(reps.map((r) => [r.id, r.full_name]))
  const prospects = applyFilters(all, filters, user.id).sort(byUrgency)

  const now = new Date()
  const rows: ProspectRow[] = prospects.map((p) => {
    const last = lastActivities.get(p.id)
    const tz = tzFor(p.country)
    const overdue = Boolean(p.next_action_at && new Date(p.next_action_at) < now)
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      zone: p.zone,
      stage: p.stage,
      whenLabel: p.next_action_at ? smartStamp(p.next_action_at, locale, tz, now) : null,
      overdue,
      lateBy: overdue && p.next_action_at ? lateness(p.next_action_at, now) : null,
      lastNote: last?.note ?? null,
      lastResultLabel: last?.result ? t.result[last.result] : null,
      repLabel: p.rep_id ? (repName.get(p.rep_id) ?? null) : t.list.unassigned,
    }
  })

  const query = filtersToQuery(filters)

  return (
    <>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-4 sm:mb-5">
        <div>
          <p className="eyebrow eyebrow-mark mb-3 hidden sm:inline-flex">{t.nav.section}</p>
          <h1 className="h-display sr-only sm:not-sr-only sm:text-4xl">{t.list.title}</h1>
          <p className="mt-2 hidden text-lg text-ink-soft sm:block">{t.list.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CrmLive
            channel={`crm-list-${user.id}`}
            liveLabel={t.today.live}
            queuedLabel={t.log.offline}
          />
          {/* Both are desktop jobs. On a phone, "Nova" is already the third
              item in the bottom tab bar, and nobody exports a spreadsheet
              between two visits. */}
          <a
            href={`/api/crm/export${query ? `?${query}` : ''}`}
            className="btn-secondary hidden md:inline-flex"
            download
          >
            <IconDownload className="h-5 w-5" />
            {t.list.export}
          </a>
          <Link href="/crm/prospetos/novo" className="btn-primary hidden md:inline-flex">
            <IconPlus className="h-5 w-5" />
            {t.nav.novo}
          </Link>
        </div>
      </div>

      <ProspectFilters
        filters={filters}
        reps={reps}
        isAdmin={isAdmin}
        showMine={rep !== null}
        dict={dict}
      />

      <p className="mb-2 text-base text-ink-mute sm:mb-3">
        {prospects.length} {t.list.results}
      </p>

      {/* Phone: cards, with the phone number as the main action. */}
      <div className="md:hidden">
        <ProspectCards rows={rows} strings={crmStrings(dict)} emptyMessage={t.list.empty} showStage />
      </div>

      {/* Desktop: same data, more density. */}
      <div className="hidden md:block">
        {prospects.length === 0 ? (
          <div className="card px-6 py-10 text-center text-lg text-ink-mute">{t.list.empty}</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-paper-2">
                  <Th>{t.list.colName}</Th>
                  <Th>{t.list.colZone}</Th>
                  <Th>{dict.common.phone}</Th>
                  <Th>{t.list.colStage}</Th>
                  <Th>{t.list.colRep}</Th>
                  <Th>{t.list.colNext}</Th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => {
                  const tz = tzFor(p.country)
                  const overdue = Boolean(p.next_action_at && new Date(p.next_action_at) < now)
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper-2/60">
                      <Td>
                        <Link
                          href={`/crm/prospetos/${p.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <span className="ml-2 text-sm text-ink-mute">
                          {t.specialty[p.specialty]}
                        </span>
                      </Td>
                      <Td className="text-ink-soft">{p.zone ?? '—'}</Td>
                      <Td>
                        {p.phone ? (
                          <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="text-ink hover:text-accent">
                            {p.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td>
                        <Badge tone={stageTone[p.stage]}>{t.stage[p.stage]}</Badge>
                      </Td>
                      <Td className="text-ink-soft">
                        {p.rep_id ? (repName.get(p.rep_id) ?? '—') : t.list.unassigned}
                      </Td>
                      <Td className={overdue ? 'font-semibold text-warn' : 'text-ink-soft'}>
                        {p.next_action_at
                          ? smartStamp(p.next_action_at, locale, tz, now)
                          : t.list.noNext}
                      </Td>
                      <Td>
                        <Link
                          href={`/crm/prospetos/${p.id}`}
                          className="inline-flex text-ink-mute hover:text-accent"
                          aria-label={p.name}
                        >
                          <IconChevron className="h-5 w-5" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
