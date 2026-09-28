import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorState, SectionTitle } from '@/components/ui'
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

  // ── HAS THIS PERSON BEEN HERE BEFORE? ─────────────────────────────────────
  // The question a clinic asks itself while looking at a booking, and until
  // now nothing on the screen could answer it. One query for everybody on the
  // page rather than one per card: twenty cards would otherwise be twenty
  // round trips to say "second visit".
  const patientIds = [...new Set(appts.map((a) => a.patient_id).filter(Boolean))] as string[]
  const visits = new Map<string, number>()
  if (patientIds.length) {
    const { data: history } = await supabase
      .from('appointments')
      .select('patient_id')
      .eq('clinic_id', clinicId)
      .in('patient_id', patientIds)
    for (const row of (history ?? []) as Array<{ patient_id: string | null }>) {
      if (row.patient_id) visits.set(row.patient_id, (visits.get(row.patient_id) ?? 0) + 1)
    }
  }
  // ── TWO GROUPS, EACH WITH ITS OWN ORDER AND ITS OWN HEADING ───────────────
  // The order was right and invisible: unanswered first by appointment date,
  // then everything else. In a two column grid with no headings, twenty cards
  // read as one undifferentiated pile, and a booking taken five minutes ago for
  // a fortnight away lands near the bottom of the first group with nothing
  // saying it is in a group at all.
  //
  // So the groups are drawn, counted and captioned with the rule they are
  // sorted by. The order does not change; it stops being something you have to
  // work out.
  const pending = appts
    .filter((a) => a.status === 'pendente')
    // The soonest appointment, because that is the one that stops being
    // answerable first.
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))

  const answered = appts
    .filter((a) => a.status !== 'pendente')
    // What was answered most recently, because "did I confirm that one?" is a
    // question about the last few minutes. `decided_at` is null on a booking the
    // patient cancelled, which nobody decided, so it falls back to when it
    // arrived.
    .sort(
      (a, b) =>
        +new Date(b.decided_at ?? b.cancelled_at ?? b.created_at) -
        +new Date(a.decided_at ?? a.cancelled_at ?? a.created_at)
    )

  // ── THE FIRST TAB IS NOT "ALL" ────────────────────────────────────────────
  // It said "Todas" and showed what is above: everything unanswered, and
  // everything decided in the last thirty days. A reader who sees "all" and is
  // shown a subset does not conclude that the screen is scoped, they conclude
  // that the older ones were deleted, which is the one thing that does not
  // happen to a booking here.
  //
  // So the tab says "Recentes", which under-promises: an unanswered booking
  // from two months ago is still on it. The scope itself is stated once, in the
  // line under the title, where it is read before the tabs rather than
  // discovered through them.
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
        <>
          {[
            { rows: pending, title: dict.marcacoes.groupPending, order: dict.marcacoes.orderPending },
            { rows: answered, title: dict.marcacoes.groupAnswered, order: dict.marcacoes.orderAnswered },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.title} className="mb-10 last:mb-0">
                <div className="mb-4">
                  <SectionTitle>{fill(g.title, { n: g.rows.length })}</SectionTitle>
                  {/* The rule, said once per group. A list whose order nobody
                      can name is a list people scroll instead of read. */}
                  <p className="-mt-3 text-sm text-ink-mute">{g.order}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {g.rows.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      // Only when there is a before. "First visit" on every card
                      // is noise on the days when it is true and wrong on the
                      // days the record simply has not caught up.
                      visits={appt.patient_id ? (visits.get(appt.patient_id) ?? 0) : 0}
                      dict={dict}
                      locale={locale}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </section>
            ))}
        </>
      )}
    </>
  )
}
