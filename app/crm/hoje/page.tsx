import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  fetchLastActivities,
  fetchReps,
  fetchVisibleProspects,
  isActive,
  requireCrmSession,
} from '@/lib/crm/data'
import { endOfDayIn, lateness, smartStamp, tzFor } from '@/lib/crm/time'
import { telHref } from '@/lib/crm/phone'
import { ProspectCards, type ProspectRow } from '@/components/crm/ProspectCards'
import { crmStrings } from '@/lib/crm/strings'
import { CrmLive } from '@/components/crm/CrmLive'

export const dynamic = 'force-dynamic'

// HOJE is the home screen of a rep. No navigation needed to reach it: signing
// in lands here. One list, ordered by the hour, most urgent at the top.
export default async function CrmHojePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; scope?: string }>
}) {
  const { tab, scope } = await searchParams
  const { user, isAdmin, rep, dict, locale } = await requireCrmSession()
  const t = dict.crm
  const supabase = await createClient()

  const [prospects, reps, lastActivities] = await Promise.all([
    fetchVisibleProspects(supabase),
    fetchReps(supabase),
    fetchLastActivities(supabase),
  ])
  const repName = new Map(reps.map((r) => [r.id, r.full_name]))

  // "Today" ends at midnight where the rep works, not where the server runs.
  const now = new Date()
  const cutoff = endOfDayIn(tzFor(rep?.country ?? 'PT'), now).getTime()

  // Whose day is this?
  //
  // Somebody can be both admin and rep (Domingos runs the team and works the
  // street). For them HOJE defaults to their own calls, because that is the job
  // they do standing up, with a switch to the team view. A pure internal admin
  // with no prospects of their own only has the team view to look at.
  const canSwitch = isAdmin && rep !== null
  const teamView = canSwitch ? scope === 'team' : isAdmin
  const mine = prospects.filter((p) => teamView || p.rep_id === user.id)

  const toRow = (p: (typeof mine)[number]): ProspectRow => {
    const last = lastActivities.get(p.id)
    const tz = tzFor(p.country)
    const overdue = Boolean(p.next_action_at && new Date(p.next_action_at) < now)
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      telHref: telHref(p.phone, p.country),
      zone: p.zone,
      stage: p.stage,
      whenLabel: p.next_action_at ? smartStamp(p.next_action_at, locale, tz, now) : null,
      overdue,
      lateBy: overdue && p.next_action_at ? lateness(p.next_action_at, now) : null,
      lastNote: last?.note ?? p.next_action_text ?? null,
      lastResultLabel: last?.result ? t.result[last.result] : null,
      referral:
        p.origin === 'referral' ? (p.origin_note || t.origin.referral) : null,
      // Only worth naming the owner when looking at more than your own work.
      repLabel: teamView
        ? p.rep_id
          ? (repName.get(p.rep_id) ?? null)
          : t.list.unassigned
        : null,
    }
  }

  const dueRows = mine
    .filter((p) => isActive(p) && p.next_action_at && new Date(p.next_action_at).getTime() <= cutoff)
    .sort(
      (a, b) =>
        new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime()
    )
    .map(toRow)

  const noDateRows = mine
    .filter((p) => isActive(p) && !p.next_action_at)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toRow)

  const showNoDate = tab === 'sem-data'
  const rows = showNoDate ? noDateRows : dueRows

  // Keep whichever of the two choices the user did not just click.
  const tabQuery = showNoDate ? '?tab=sem-data' : ''
  const scopeQuery = teamView ? '?scope=team' : ''

  return (
    <>
      <div className="mb-2 sm:mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Kept for screen readers and landmarks, shown from tablet up: on a
              phone the tab bar already names the screen, and every pixel here
              pushes the first call further down. */}
          <h1 className="h-display sr-only sm:not-sr-only sm:text-4xl">{t.today.title}</h1>

          {/* Whose day. One button that names where it takes you, sharing the
              row with the live dot rather than taking one of its own. */}
          {canSwitch && (
            <Link
              href={
                teamView
                  ? `/crm/hoje${tabQuery}`
                  : `/crm/hoje?scope=team${tabQuery ? '&tab=sem-data' : ''}`
              }
              className="flex min-h-[2.75rem] items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-base font-medium text-ink-soft hover:border-ink hover:text-ink sm:order-last"
            >
              {teamView ? t.today.scopeMine : t.today.scopeTeam}
            </Link>
          )}

          <CrmLive
            channel={`crm-hoje-${user.id}`}
            liveLabel={t.today.live}
            queuedLabel={t.log.offline}
          />
        </div>
        <p className="mt-2 hidden text-lg text-ink-soft sm:block">{t.today.subtitle}</p>
      </div>

      <div
        role="tablist"
        aria-label={t.today.title}
        className="mb-3 flex gap-1 rounded-2xl border border-line bg-surface-sunken p-1 sm:mb-5"
      >
        <Tab href={`/crm/hoje${scopeQuery}`} active={!showNoDate} count={dueRows.length}>
          {t.today.tabToday}
        </Tab>
        <Tab
          href={`/crm/hoje?tab=sem-data${scopeQuery ? '&scope=team' : ''}`}
          active={showNoDate}
          count={noDateRows.length}
        >
          {t.today.tabNoDate}
        </Tab>
      </div>

      {showNoDate && <p className="mb-3 text-base text-ink-mute">{t.today.noDateHelp}</p>}

      <ProspectCards
        rows={rows}
        strings={crmStrings(dict)}
        emptyMessage={showNoDate ? t.today.emptyNoDate : t.today.empty}
        showStage={showNoDate}
      />
    </>
  )
}

function Tab({
  href,
  active,
  count,
  children,
}: {
  href: string
  active: boolean
  count: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`flex min-h-[3rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-base font-medium transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
      <span className={active ? 'text-white/70' : 'text-ink-mute'}>{count}</span>
    </Link>
  )
}
