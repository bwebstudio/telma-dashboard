import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  fetchActivitiesSince,
  fetchVisibleProspects,
  isActive,
  requireCrmSession,
} from '@/lib/crm/data'
import { endOfDayIn, tzFor } from '@/lib/crm/time'
import { CRM_STAGES, type CrmStage } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

// The rep's summary.
//
// Deliberately not a dashboard. No charts, no gauges, no month-over-month
// deltas: a rep reads this standing on a pavement between two visits, and the
// only questions worth answering there are "what needs me", "where do I still
// have work" and "am I actually moving".
//
// Every number is a link. A count you cannot tap is decoration — the point of
// seeing "34 in Eixample" is to go and work Eixample.

const STAGE_BAR: Record<CrmStage, string> = {
  new: 'bg-ink-mute',
  attempting: 'bg-warn',
  contacted: 'bg-brand-accent',
  interested: 'bg-brand-accent',
  meeting: 'bg-brand',
  won: 'bg-ok',
  lost: 'bg-danger',
}

export default async function ResumoPage() {
  const { user, isAdmin, rep, dict, locale } = await requireCrmSession()
  const t = dict.crm
  const supabase = await createClient()

  const since = new Date(Date.now() - 7 * 24 * 3600_000)
  const [all, week] = await Promise.all([
    fetchVisibleProspects(supabase),
    fetchActivitiesSince(supabase, since.toISOString()),
  ])

  // An admin who also carries prospects sees their own here; the team view
  // lives on the Equipa screen, which exists for exactly that.
  const mine = all.filter((p) => p.rep_id === user.id)
  const unassigned = all.filter((p) => p.rep_id === null && isActive(p))

  const now = new Date()
  const cutoff = endOfDayIn(tzFor(rep?.country ?? 'PT'), now).getTime()
  const overdue = mine.filter(
    (p) => isActive(p) && p.next_action_at && new Date(p.next_action_at).getTime() <= cutoff
  ).length
  const noDate = mine.filter((p) => isActive(p) && !p.next_action_at).length

  const byStage = new Map<CrmStage, number>()
  for (const p of mine) byStage.set(p.stage, (byStage.get(p.stage) ?? 0) + 1)
  const peak = Math.max(1, ...CRM_STAGES.map((s) => byStage.get(s) ?? 0))

  // Where the work still is: clinics nobody has moved off "new" or "attempting",
  // grouped by the area a rep would walk.
  const pendingByZone = new Map<string, number>()
  for (const p of mine) {
    if (!isActive(p)) continue
    if (p.stage !== 'new' && p.stage !== 'attempting') continue
    const zone = p.zone?.trim() || '—'
    pendingByZone.set(zone, (pendingByZone.get(zone) ?? 0) + 1)
  }
  const zones = [...pendingByZone.entries()].sort((a, b) => b[1] - a[1])
  const topZones = zones.slice(0, 6)
  // The count of zones left over, not of clinics in them: the label says
  // "other areas" and a number that means something else is worse than none.
  const restZones = Math.max(0, zones.length - topZones.length)

  const mineIds = new Set(mine.map((p) => p.id))
  const weekMine = week.filter((a) => mineIds.has(a.prospect_id))
  const weekStats = {
    calls: weekMine.length,
    clinics: new Set(weekMine.map((a) => a.prospect_id)).size,
    interested: weekMine.filter((a) => a.result === 'interested' || a.result === 'meeting_set')
      .length,
    won: weekMine.filter((a) => a.result === 'won').length,
  }

  const nothingPending = overdue === 0 && noDate === 0

  if (mine.length === 0) {
    return (
      <>
        <Header title={t.resumo.title} subtitle={t.resumo.subtitle} />
        <div className="card px-6 py-10 text-center text-lg text-ink-mute">{t.resumo.empty}</div>
      </>
    )
  }

  return (
    <>
      <Header title={t.resumo.title} subtitle={t.resumo.subtitle} />

      {/* What needs her today. First, because it is the only block that is
          about right now rather than about the shape of things. */}
      <section className="mb-5">
        <h2 className="label-caps mb-2">{t.resumo.attention}</h2>
        {nothingPending && unassigned.length === 0 ? (
          <p className="card px-4 py-4 text-base text-ink-soft">{t.resumo.nothingPending}</p>
        ) : (
          <div className="card divide-y divide-line">
            {overdue > 0 && (
              <CountRow href="/crm/hoje" label={t.resumo.overdue} value={overdue} tone="warn" />
            )}
            {noDate > 0 && (
              <CountRow href="/crm/hoje?tab=sem-data" label={t.resumo.noDate} value={noDate} />
            )}
            {unassigned.length > 0 && (
              <CountRow
                href="/crm/prospetos?rep=none"
                label={t.resumo.unassigned}
                value={unassigned.length}
              />
            )}
          </div>
        )}
      </section>

      {/* The shape of the funnel. A bar per stage rather than a pie: the
          question is "how much is stuck where", and length answers it faster
          than an angle. */}
      <section className="mb-5">
        <h2 className="label-caps mb-1">{t.resumo.funnel}</h2>
        <p className="mb-2 text-sm text-ink-mute">{t.resumo.funnelHint}</p>
        <div className="card divide-y divide-line">
          {CRM_STAGES.filter((s) => (byStage.get(s) ?? 0) > 0).map((stage) => {
            const count = byStage.get(stage) ?? 0
            return (
              <Link
                key={stage}
                href={`/crm/prospetos?stage=${stage}`}
                className="flex min-h-[3rem] items-center gap-3 px-4 py-2 hover:bg-surface-sunken"
              >
                <span className="w-[42%] shrink-0 truncate text-base text-ink">
                  {t.stage[stage]}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                  <span
                    className={`block h-full rounded-pill ${STAGE_BAR[stage]}`}
                    style={{ width: `${Math.max(6, (count / peak) * 100)}%` }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-base font-mid tabular-nums text-ink">
                  {count}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Where to go next. Only the stages that still need a first real
          conversation, because that is what a walking route is planned around. */}
      {topZones.length > 0 && (
        <section className="mb-5">
          <h2 className="label-caps mb-1">{t.resumo.byZone}</h2>
          <p className="mb-2 text-sm text-ink-mute">{t.resumo.byZoneHint}</p>
          <div className="card divide-y divide-line">
            {topZones.map(([zone, count]) => (
              <CountRow
                key={zone}
                href={`/crm/prospetos?q=${encodeURIComponent(zone)}`}
                label={zone}
                value={count}
              />
            ))}
            {restZones > 0 && (
              <p className="px-4 py-3 text-sm text-ink-mute">
                +{restZones} {t.resumo.otherZones}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Am I moving? Four numbers, one row, no comparison to last week: a
          rep does not need a trend line to know whether they made calls. */}
      <section className="mb-2">
        <h2 className="label-caps mb-2">{t.resumo.week}</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label={t.resumo.weekCalls} value={weekStats.calls} />
          <Metric label={t.resumo.weekClinics} value={weekStats.clinics} />
          <Metric label={t.resumo.weekInterested} value={weekStats.interested} tone="brand" />
          <Metric label={t.resumo.weekWon} value={weekStats.won} tone="ok" />
        </dl>
      </section>

      {isAdmin && (
        <Link
          href="/crm/equipa"
          className="mt-4 inline-flex min-h-[2.75rem] items-center text-base text-ink-mute hover:text-brand-accent"
        >
          {t.team.title} →
        </Link>
      )}
    </>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h1 className="h-display text-2xl sm:text-3xl">{title}</h1>
      <p className="mt-1 hidden text-lg text-ink-soft sm:block">{subtitle}</p>
    </div>
  )
}

function CountRow({
  href,
  label,
  value,
  tone,
}: {
  href: string
  label: string
  value: number
  tone?: 'warn'
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 hover:bg-surface-sunken"
    >
      <span className="truncate text-base text-ink">{label}</span>
      <span
        className={`shrink-0 text-lg font-mid tabular-nums ${
          tone === 'warn' ? 'text-warn' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </Link>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'brand' | 'ok'
}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'brand' ? 'text-brand' : 'text-ink'
  return (
    <div className="card px-3 py-3">
      <dt className="text-sm text-ink-mute">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-mid tabular-nums ${color}`}>{value}</dd>
    </div>
  )
}
