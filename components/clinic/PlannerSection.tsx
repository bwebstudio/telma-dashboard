import { createClient } from '@/lib/supabase/server'
import type { Dictionary, Locale } from '@/content'
import { SectionTitle } from '@/components/ui'
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
import type { Appointment, AvailabilitySlot, BlockedDay, Clinic } from '@/lib/types'

/**
 * The weeks and months of the clinic's diary.
 *
 * It lived under Configuração, inside Horários, and it is not configuration:
 * it is the calendar of real bookings, at a different zoom from the day. The
 * hour grid it used to sit above says which hours the clinic offers in a
 * normal week -- that is a rule, and a rule is configuration. What the rule
 * produces, once the bookings and the closed days are laid over it, is the
 * agenda. Somebody looking for "what does Thursday look like" was being sent
 * to a settings page to find out.
 *
 * Its own component rather than two copies of the query, because the day view
 * and these two are one screen now and only one of them loads at a time.
 */
export async function PlannerSection({
  clinicId,
  clinic,
  view,
  pointer,
  tz,
  dict,
  locale,
  base,
}: {
  clinicId: string
  clinic: Partial<Clinic>
  view: PlannerView
  /** The week or month being looked at. Today when nobody has moved. */
  pointer: Date
  tz: string
  dict: Dictionary
  locale: Locale
  /** The route this is drawn on, so the arrows and the tabs link back to it. */
  base: string
}) {
  const supabase = await createClient()
  const now = new Date()
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
    <section className="mb-12">
      <SectionTitle>{dict.horarios.planTitle}</SectionTitle>
      <p className="mb-5 text-base text-ink-soft">{dict.horarios.planHelp}</p>

      <PlannerNav
        view={view}
        prevKey={prevKey}
        nextKey={nextKey}
        todayHref={`${base}?v=${view}`}
        label={label}
        labels={{
          week: dict.horarios.viewWeek,
          month: dict.horarios.viewMonth,
          prev: dict.horarios.prev,
          next: dict.horarios.next,
          thisOne: view === 'mes' ? dict.horarios.thisMonth : dict.horarios.thisWeek,
        }}
        base={base}
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
        step={clinic?.slot_minutes ?? 60}
        duration={clinic?.appointment_duration_minutes ?? 30}
        clinic={clinic ?? {}}
      />
    </section>
  )
}
