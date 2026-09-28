import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { AgendaDay } from '@/components/clinic/AgendaDay'
import { AgendaLive } from '@/components/clinic/AgendaLive'
import { ElsewhereNote } from '@/components/clinic/ElsewhereNote'
import { BillingLive } from '@/components/clinic/BillingLive'
import { DaySwitcher } from '@/components/clinic/DaySwitcher'
import { LiveBar } from '@/components/clinic/LiveBar'
import { DayTally } from '@/components/clinic/DayTally'
import { MinutesProgressCard } from '@/components/clinic/MinutesProgressCard'
import { PlannerSection } from '@/components/clinic/PlannerSection'
import { ViewSwitcher } from '@/components/clinic/ViewSwitcher'
import { getClinicWithPlan, getMinutePackOffer } from '@/lib/clinic-utils'
import { percentUsed } from '@/lib/purchase-utils'
import {
  dayKeyIn,
  dayIn,
  fromDayKey,
  startOfDayIn,
  endOfDayIn,
  isSameDayIn,
  weekdayDateIn,
} from '@/lib/time'
import type { Appointment, Call } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; v?: string; p?: string }>
}) {
  const { d, v, p } = await searchParams
  const { locale, dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const tz = clinic?.timezone || 'Europe/Lisbon'
  const now = new Date()

  // ── ONE SCREEN, THREE ZOOMS ───────────────────────────────────────────────
  // The day, the week and the month are the same diary looked at from
  // different distances, and they were in two different places: the day here,
  // the other two inside Horários, under Configuração. Somebody wanting to
  // know what Thursday looks like was being sent to a settings page.
  //
  // The day stays the default, because it is what the clinic opens the panel
  // for every morning. The counters, the minutes and the band belong to it and
  // not to the others: "what Telma did today" does not become a different
  // question because somebody is looking at November.
  const view = v === 'semana' ? 'semana' : v === 'mes' ? 'mes' : 'dia'
  const day = (d && fromDayKey(d)) || now
  const dayStart = startOfDayIn(tz, day)
  const dayEnd = endOfDayIn(tz, day)
  const isToday = isSameDayIn(day, now, tz)

  // Today's own boundaries, for the counters and the alert band. They are the
  // clinic's day, not the selected one: "what happened today" does not change
  // because somebody is looking at next Tuesday.
  const todayStart = startOfDayIn(tz, now)
  const todayEnd = endOfDayIn(tz, now)

  const [dayRes, pendingRes, cancelledRes, cancelledTodayRes, callsRes] = await Promise.all([
    // The day on screen.
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString())
      .order('scheduled_at', { ascending: true }),
    // Everything still waiting for an answer, whatever day it is for. A booking
    // for next week that nobody confirmed is exactly the thing that goes
    // unnoticed, so it does not get filed away under its own date.
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente')
      .gte('scheduled_at', todayStart.toISOString())
      .order('scheduled_at', { ascending: true }),
    // Cancellations nobody has said they have seen, for a slot that has not
    // already gone by. It used to age out after a day, which is the wrong end
    // to solve it from — a timer either nags about something already handled
    // or drops something nobody read. Now the clinic says when it is done.
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'cancelada')
      .is('cancel_seen_at', null)
      .gte('scheduled_at', todayStart.toISOString())
      .order('cancelled_at', { ascending: false }),
    // The counter is a different question: how many were cancelled today,
    // acknowledged or not.
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'cancelada')
      .gte('cancelled_at', todayStart.toISOString())
      .lte('cancelled_at', todayEnd.toISOString()),
    supabase
      .from('calls')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
  ])

  const dayAppointments = (dayRes.data ?? []) as Appointment[]
  const pending = (pendingRes.data ?? []) as Appointment[]
  const cancelled = (cancelledRes.data ?? []) as Appointment[]
  const calls = (callsRes.data ?? []) as Call[]

  const t = dict.agenda
  const counts = {
    calls: calls.filter((c) => c.channel === 'telefone').length,
    whatsapp: calls.filter((c) => c.channel === 'whatsapp').length,
    bookings: calls.filter((c) => c.result === 'marcacao').length,
    info: calls.filter((c) => c.result === 'informacao').length,
    cancelled: cancelledTodayRes.count ?? 0,
  }

  const dayKey = dayKeyIn(tz, day)

  // The minutes, and whether they are worth interrupting the day over.
  //
  // Under 80% the card is a status line and sits with the rest of the summary,
  // below what Telma already handled — the reassurance the receptionist opens
  // this screen for. Past that it is news, and news that stops Telma booking
  // goes above everything, because finding out from a patient is worse than
  // finding out from a card.
  const [billing, pack] = await Promise.all([
    getClinicWithPlan(clinicId),
    getMinutePackOffer(),
  ])
  const minutesCard = billing ? (
    <MinutesProgressCard
      quiet
      minutes={billing.minutes}
      pack={pack}
      canBuy={!readOnly}
      dict={dict}
      locale={locale}
    />
  ) : null
  const minutesUrgent = billing
    ? billing.minutes.exhausted || percentUsed(billing.minutes.used, billing.minutes.allowance) >= 80
    : false

  return (
    <>
      <AgendaLive clinicId={clinicId} />
      <BillingLive clinicId={clinicId} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="h-display text-3xl sm:text-4xl">{t.title}</h1>
          <p className="mt-1 text-lg text-ink-soft">{t.greeting}</p>
          <div className="mt-4">
            <ViewSwitcher
              current={view}
              labels={{
                dia: t.viewDay,
                semana: dict.horarios.viewWeek,
                mes: dict.horarios.viewMonth,
              }}
            />
          </div>
        </div>
        <LiveBar
          clinicId={clinicId}
          renderedAt={now.toISOString()}
          locale={locale}
          liveLabel={t.live}
          lostLabel={t.liveLost}
          retryLabel={t.liveRetry}
          updatedLabel={t.updated}
        />
      </div>

      {/* Week and month: the same diary, further away. Everything between here
          and the day list is about today, so none of it is drawn. */}
      {view !== 'dia' && (
        <PlannerSection
          clinicId={clinicId}
          clinic={clinic ?? {}}
          view={view}
          pointer={(p && fromDayKey(p)) || now}
          tz={tz}
          dict={dict}
          locale={locale}
          base="/hoje"
        />
      )}

      {view === 'dia' && (
        <>
      {/* ── THE ORDER, AND WHY IT CHANGED ────────────────────────────────────
          It used to be: what Telma handled, then what needs an answer, then
          the day. The reasoning was that opening onto a stack of problems
          reads badly at eight in the morning, and that is true. What it cost
          was that the day — the thing this screen exists for — started below
          the fold, under five counter cards, a billing card and a band.

          The reassurance is kept and the cost is not: the tally is one line
          instead of five cards, and it sits under the day rather than over it.
          Somebody arriving still meets a calm line before a list of work; they
          just meet the list on the same screen.

          So: which day, the day itself, then what is going on elsewhere, then
          the money. Subject first, annotations after. */}
      {minutesUrgent && <div className="mb-8">{minutesCard}</div>}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 className="text-xl font-semibold text-ink">
          {weekdayDateIn(day.toISOString(), locale, tz)}
        </h2>
        <DaySwitcher
          current={dayKey}
          today={dayKeyIn(tz, now)}
          yesterday={dayKeyIn(tz, dayIn(tz, -1, now))}
          tomorrow={dayKeyIn(tz, dayIn(tz, 1, now))}
          labels={{
            before: t.dayBefore,
            today: t.dayToday,
            after: t.dayAfter,
            pick: t.pickDay,
          }}
        />
      </div>

      <AgendaDay
        appointments={dayAppointments}
        dict={dict}
        locale={locale}
        tz={tz}
        isToday={isToday}
        readOnly={readOnly}
      />

      {/* Not the bookings themselves: confirming lives in one place per
          context, and for anything not on this day that place is Marcações. */}
      <ElsewhereNote
        pending={pending.filter((a) => dayKeyIn(tz, new Date(a.scheduled_at)) !== dayKey).length}
        cancelled={
          cancelled.filter((a) => dayKeyIn(tz, new Date(a.scheduled_at)) !== dayKey).length
        }
        dict={dict}
      />

      {isToday && <DayTally counts={counts} whatsapp={Boolean(clinic?.addon_whatsapp)} dict={dict} />}

      {/* The money, last and quiet. It shouts for itself when it has to: past
          eighty per cent it moves to the top of the screen, above everything. */}
      {!minutesUrgent && minutesCard && <div className="mt-8">{minutesCard}</div>}
        </>
      )}
    </>
  )
}
