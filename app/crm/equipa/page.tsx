import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  fetchReps,
  fetchVisibleProspects,
  isActive,
  requireCrmSession,
} from '@/lib/crm/data'
import { setRepActive } from '@/lib/actions/crm'
import { RepForm } from '@/components/crm/RepForm'
import { Badge } from '@/components/ui'

export const dynamic = 'force-dynamic'

// One screen: how each rep is doing, and the switches to add or park one.
// Deliberately three numbers per rep and no charts. It answers "who is behind"
// in a glance, which is the only question this screen exists for.
export default async function EquipaPage() {
  const { isAdmin, dict } = await requireCrmSession()
  if (!isAdmin) redirect('/crm/hoje')

  const t = dict.crm.team
  const supabase = await createClient()
  const [reps, prospects] = await Promise.all([
    fetchReps(supabase),
    fetchVisibleProspects(supabase),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const statsFor = (repId: string | null) => {
    const mine = prospects.filter((p) => p.rep_id === repId)
    return {
      active: mine.filter(isActive).length,
      overdue: mine.filter(
        (p) => isActive(p) && p.next_action_at && new Date(p.next_action_at) < now
      ).length,
      won: mine.filter(
        (p) => p.stage === 'won' && new Date(p.updated_at) >= monthStart
      ).length,
      total: mine.length,
    }
  }

  const unassigned = statsFor(null)

  return (
    <>
      <div className="mb-6">
        <p className="eyebrow eyebrow-mark mb-3">{dict.crm.nav.section}</p>
        <h1 className="h-display text-3xl sm:text-4xl">{t.title}</h1>
        <p className="mt-2 text-lg text-ink-soft">{t.subtitle}</p>
      </div>

      {reps.length === 0 ? (
        <div className="card mb-6 px-6 py-10 text-center text-lg text-ink-mute">{t.noReps}</div>
      ) : (
        <ul className="mb-6 flex flex-col gap-3">
          {reps.map((rep) => {
            const s = statsFor(rep.id)
            return (
              <li key={rep.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold text-ink">{rep.full_name}</p>
                    <p className="text-base text-ink-soft">
                      {dict.crm.country[rep.country]}
                      {rep.territory ? ` · ${rep.territory}` : ''}
                      {rep.email ? ` · ${rep.email}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={rep.active ? 'ok' : 'neutral'}>
                      {rep.active ? t.active : t.inactive}
                    </Badge>
                    <form action={setRepActive}>
                      <input type="hidden" name="rep_id" value={rep.id} />
                      <input type="hidden" name="active" value={rep.active ? '0' : '1'} />
                      <button type="submit" className="btn-ghost min-h-[2.75rem]">
                        {rep.active ? t.deactivate : t.activate}
                      </button>
                    </form>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3">
                  <Metric label={t.activeProspects} value={s.active} />
                  <Metric label={t.overdue} value={s.overdue} tone={s.overdue > 0 ? 'warn' : undefined} />
                  <Metric label={t.wonThisMonth} value={s.won} tone={s.won > 0 ? 'ok' : undefined} />
                </dl>

                <Link
                  href={`/crm/prospetos?rep=${rep.id}`}
                  className="mt-3 inline-block text-base font-medium text-accent hover:underline"
                >
                  {dict.crm.list.title} ({s.total})
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <section className="card mb-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-serif text-lg font-semibold text-ink">{t.unassignedPool}</p>
          <Link href="/crm/prospetos?rep=none" className="btn-secondary min-h-[2.75rem]">
            {unassigned.active}
          </Link>
        </div>
      </section>

      <RepForm dict={dict} />
    </>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'warn' | 'ok'
}) {
  const color = tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="rounded-xl bg-paper-2 px-3 py-2">
      <dt className="text-sm text-ink-mute">{label}</dt>
      <dd className={`font-serif text-2xl font-semibold ${color}`}>{value}</dd>
    </div>
  )
}
