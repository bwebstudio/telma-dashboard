import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorState } from '@/components/ui'
import { AppointmentCard } from '@/components/AppointmentCard'
import { AgendaLive } from '@/components/clinic/AgendaLive'
import { fill } from '@/lib/fill'
import type { Appointment } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MarcacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const { f } = await searchParams
  const onlyPending = f === 'pending'
  const onlyCancelled = f === 'cancelled'
  const { locale, dict } = await getDict()
  const { clinicId, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  // ── A QUEUE, NOT AN ARCHIVE ───────────────────────────────────────────────
  // This loaded every appointment the clinic had ever had, with no limit. A
  // clinic doing twenty bookings a week has a thousand of them in one page
  // within a year, and the page that is meant to be worked through becomes a
  // page nobody opens.
  //
  // And the answer is not to paginate it. The subtitle on this screen says
  // what it is for -- "Telma leaves the bookings here, confirm each one and
  // pass it to the clinic's software" -- and a queue is a thing that is empty
  // when you have finished. So: everything still waiting, however old, because
  // an unanswered booking must never fall off a list; and everything decided
  // recently, because "did I confirm that one?" is a question about this week.
  //
  // Older than that is not lost, it is elsewhere: in the agenda, on its day.
  // Which is also why the cards can stay cards. They are right *because* the
  // list is meant to be short.
  const RECENT_DAYS = 30
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString()

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('status', { ascending: true })
    .order('scheduled_at', { ascending: true })
  if (onlyPending) query = query.eq('status', 'pendente')
  if (onlyCancelled) query = query.eq('status', 'cancelada')
  // `decided_at` is null on anything still waiting, so this keeps every one of
  // them whatever its age and trims only what somebody has already answered.
  if (!onlyPending) query = query.or(`decided_at.is.null,decided_at.gte.${since}`)

  const [{ data, error }, { count: olderCount }] = await Promise.all([
    query,
    supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .not('decided_at', 'is', null)
      .lt('decided_at', since),
  ])
  const appts = (data ?? []) as Appointment[]
  // Pending first, then the rest by most recent.
  appts.sort((a, b) => {
    if (a.status === 'pendente' && b.status !== 'pendente') return -1
    if (a.status !== 'pendente' && b.status === 'pendente') return 1
    return a.status === 'pendente'
      ? +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
      : +new Date(b.created_at) - +new Date(a.created_at)
  })

  const tab = (key: 'all' | 'pending' | 'cancelled', label: string) => {
    const active =
      key === 'pending' ? onlyPending : key === 'cancelled' ? onlyCancelled : !onlyPending && !onlyCancelled
    return (
      <Link
        href={key === 'all' ? '/marcacoes' : `/marcacoes?f=${key}`}
        className={`rounded-full px-4 py-2 text-base font-medium ${
          active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
      <AgendaLive clinicId={clinicId} />
      <PageHeader eyebrow={dict.clinicNav.marcacoes} title={dict.marcacoes.title} subtitle={dict.marcacoes.help} />

      <div className="mb-6 inline-flex rounded-full border border-line-strong bg-surface p-1">
        {tab('all', dict.marcacoes.filterAll)}
        {tab('pending', dict.marcacoes.filterPending)}
        {tab('cancelled', dict.marcacoes.filterCancelled)}
      </div>

      {/* What is not on screen, said rather than hidden. A list that quietly
          stops at thirty days is a list somebody will one day accuse of having
          lost something. */}
      {!onlyPending && (olderCount ?? 0) > 0 && (
        <p className="mb-6 text-base text-ink-mute">
          {fill(dict.marcacoes.olderHint, { n: olderCount ?? 0, days: RECENT_DAYS })}{' '}
          <Link href="/hoje" className="text-brand-accent hover:text-brand-hover">
            {dict.marcacoes.olderGo}
          </Link>
        </p>
      )}

      {error ? (
        <ErrorState title={dict.common.errorTitle} message={dict.common.errorGeneric} />
      ) : appts.length === 0 ? (
        <EmptyState>{dict.marcacoes.empty}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {appts.map((appt) => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              dict={dict}
              locale={locale}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </>
  )
}
