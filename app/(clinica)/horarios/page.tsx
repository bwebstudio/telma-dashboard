import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { AvailabilityGrid } from '@/components/AvailabilityGrid'
import { BlockedDaysManager } from '@/components/BlockedDaysManager'
import { Planner, type PlannerView } from '@/components/clinic/Planner'
import { PlannerNav } from '@/components/clinic/PlannerNav'
import {
  dayIn,
  dayKeyIn,
  daysInMonthIn,
  endOfDayIn,
  fromDayKey,
  monthLabelIn,
  monthStartIn,
  startOfDayIn,
  weekStartIn,
} from '@/lib/time'
import type { Appointment, AvailabilitySlot, BlockedDay } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HorariosPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; p?: string }>
}) {
  const { v, p } = await searchParams
  const { locale, dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const tz = clinic?.timezone || 'Europe/Lisbon'
  const now = new Date()
  const view: PlannerView = v === 'mes' ? 'mes' : 'semana'
  const pointer = (p && fromDayKey(p)) || now

  // The window on screen, and the one the queries ask for. The month view draws
  // six rows, so it reaches into the neighbouring months and has to load them
  // too — otherwise the last days of the previous month always look empty.
  const anchor = view === 'mes' ? monthStartIn(tz, pointer) : weekStartIn(tz, pointer)
  const from = view === 'mes' ? dayIn(tz, -7, anchor) : anchor
  const to = view === 'mes' ? dayIn(tz, daysInMonthIn(tz, anchor) + 13, anchor) : dayIn(tz, 6, anchor)

  const rangeStart = startOfDayIn(tz, from)
  const rangeEnd = endOfDayIn(tz, to)

  const [slotsRes, blockedRes, apptsRes] = await Promise.all([
    supabase.from('availability_slots').select('*').eq('clinic_id', clinicId),
    supabase
      .from('blocked_days')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('day', { ascending: true }),
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', rangeStart.toISOString())
      .lte('scheduled_at', rangeEnd.toISOString()),
  ])

  const slots = (slotsRes.data ?? []) as AvailabilitySlot[]
  const blocked = (blockedRes.data ?? []) as BlockedDay[]
  const appointments = (apptsRes.data ?? []) as Appointment[]

  const step = view === 'mes' ? daysInMonthIn(tz, anchor) : 7
  const prevKey = dayKeyIn(tz, dayIn(tz, view === 'mes' ? -1 : -7, anchor))
  const nextKey = dayKeyIn(tz, dayIn(tz, step, anchor))

  const label =
    view === 'mes'
      ? monthLabelIn(anchor, locale, tz)
      : `${dayKeyIn(tz, anchor).slice(8)}–${dayKeyIn(tz, dayIn(tz, 6, anchor)).slice(8)} ${monthLabelIn(anchor, locale, tz)}`

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.horarios} title={dict.horarios.title} />

      {/* Planning first. The hour grid further down is the rule; this is the
          calendar that rule produces, and it is the one somebody opens when
          they are deciding whether they can close for three days in June. */}
      <section className="mb-12">
        <SectionTitle>{dict.horarios.planTitle}</SectionTitle>
        <p className="mb-5 text-base text-ink-soft">{dict.horarios.planHelp}</p>

        <PlannerNav
          view={view}
          prevKey={prevKey}
          nextKey={nextKey}
          todayHref={`/horarios?v=${view}`}
          label={label}
          labels={{
            week: dict.horarios.viewWeek,
            month: dict.horarios.viewMonth,
            prev: dict.horarios.prev,
            next: dict.horarios.next,
            thisOne: view === 'mes' ? dict.horarios.thisMonth : dict.horarios.thisWeek,
          }}
        />

        <Planner
          view={view}
          anchor={anchor}
          slots={slots}
          blocked={blocked}
          appointments={appointments}
          dict={dict}
          locale={locale}
          tz={tz}
          now={now}
        />
      </section>

      <section className="mb-12">
        <SectionTitle>{dict.horarios.title}</SectionTitle>
        <div className="mb-5 rounded-2xl bg-brand px-5 py-4 text-white">
          <p className="text-lg font-medium">{dict.horarios.help}</p>
        </div>
        <div className="card p-5 sm:p-6">
          <AvailabilityGrid slots={slots} dict={dict} readOnly={readOnly} />
        </div>
      </section>

      <section>
        <SectionTitle>{dict.horarios.blockedTitle}</SectionTitle>
        <p className="mb-5 text-base text-ink-soft">{dict.horarios.blockedHelp}</p>
        <div className="card p-5 sm:p-6">
          <BlockedDaysManager days={blocked} dict={dict} locale={locale} readOnly={readOnly} />
        </div>
      </section>
    </>
  )
}
