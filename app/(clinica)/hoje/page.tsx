import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { AgendaDay } from '@/components/clinic/AgendaDay'
import { AgendaLive } from '@/components/clinic/AgendaLive'
import { ElsewhereNote } from '@/components/clinic/ElsewhereNote'
import { BillingLive } from '@/components/clinic/BillingLive'
import { DaySwitcher } from '@/components/clinic/DaySwitcher'
import { LiveBar } from '@/components/clinic/LiveBar'
import { DayTally } from '@/components/clinic/DayTally'
import { DayLoad } from '@/components/clinic/DayLoad'
import { isOnboardingLocale, DEFAULT_ONBOARDING_LOCALE } from '@/lib/onboarding/locale'
import { ForwardingCard } from '@/components/clinic/ForwardingCard'
import type { ForwardType } from '@/lib/forwarding'
import { MinutesProgressCard } from '@/components/clinic/MinutesProgressCard'
import { MessagesDay } from '@/components/clinic/MessagesDay'
import { weekRowLabel } from '@/lib/format'
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
  weekdayIn,
} from '@/lib/time'
import { dayFacts } from '@/lib/agenda-facts'
import { clinicLanguageSettings } from '@/lib/actions/clinic-settings'
import { startsIn } from '@/lib/slots'
import type { Appointment, AvailabilitySlot, BlockedDay, Call } from '@/lib/types'

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

  // ── THE DAY, WHEN THERE IS NO DIARY ──────────────────────────────────────
  // A clinic whose Telma only takes messages has no bookings to show and
  // still opens this screen every morning for the same reason everybody does:
  // to find out how the day is going. So the first entry in the menu keeps
  // its place and changes its meaning -- what Telma did today, and the week
  // under it -- and none of the diary below is read at all.
  if (clinic?.takes_bookings === false) {
    const weekFrom = startOfDayIn(tz, dayIn(tz, -6, now))
    const [dayCallsRes, weekCallsRes, billingOnly, packOnly] = await Promise.all([
      supabase
        .from('calls')
        .select('*')
        .eq('clinic_id', clinicId)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('calls')
        .select('created_at, result')
        .eq('clinic_id', clinicId)
        .gte('created_at', weekFrom.toISOString())
        .lte('created_at', todayEnd.toISOString()),
      // The clinic this request already has, rather than reading it twice.
      getClinicWithPlan(clinicId, clinic),
      getMinutePackOffer(),
    ])

    const weekRows = (weekCallsRes.data ?? []) as Array<{ created_at: string; result: string | null }>
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = dayIn(tz, i - 6, now)
      const key = dayKeyIn(tz, d)
      const mine = weekRows.filter((r) => dayKeyIn(tz, new Date(r.created_at)) === key)
      return {
        dayKey: key,
        label: weekRowLabel(d.toISOString(), locale, tz),
        answered: mine.filter((r) => r.result !== 'nao_atendida').length,
        missed: mine.filter((r) => r.result === 'nao_atendida').length,
      }
    })

    // ── WHICH OF THESE PEOPLE ALREADY HAVE A RECORD, AND WHAT THEY ARE CALLED
    // One query for the whole day, keyed on the nine digits a call carries,
    // so each row can either lead to the record or offer to open one. A
    // record is where every follow-up lives, and on this clinic nothing else
    // creates them. See components/clinic/FollowCaller.
    //
    // The name travels with it, because a row showing only a number makes
    // reception look up who it is before they can ring back. If we hold the
    // record we know, and the one thing a number cannot do is be greeted.
    //
    // A list per number and not one record, because a number is often a
    // household: the key has been (clinic, digits, name) since 0049, on
    // purpose, so Ana's history does not end up filed under João. Which of
    // them rang is decided on the row, by the name Telma heard. See
    // components/clinic/MessagesDay.
    const dayCalls = (dayCallsRes.data ?? []) as Call[]
    const digits = [
      ...new Set(
        dayCalls
          .map((c) => (c.from_phone ?? '').replace(/\D/g, '').slice(-9))
          .filter((d) => d.length === 9)
      ),
    ]
    const records: Record<
      string,
      Array<{ id: string; name: string; nameKey: string; followUpSince: string | null }>
    > = {}
    if (digits.length) {
      const { data: known } = await supabase
        .from('patients')
        .select('id, name, name_key, phone_digits, follow_up_since')
        .eq('clinic_id', clinicId)
        .in('phone_digits', digits)
        .order('name')
      for (const row of (known ?? []) as Array<{
        id: string
        name: string
        name_key: string | null
        phone_digits: string
        follow_up_since: string | null
      }>) {
        ;(records[row.phone_digits] ??= []).push({
          id: row.id,
          name: row.name,
          nameKey: row.name_key ?? row.name.trim().toLowerCase(),
          followUpSince: row.follow_up_since,
        })
      }
    }

    // ── AND WHAT HAS BEEN TRIED SINCE ────────────────────────────────────
    // "Já liguei de volta" is an attempt to reach a person, not a thing that
    // happened to a call, so it is written in that person's history: the same
    // log the record's own "registar tentativa" writes and counts. The day's
    // rows read it back from there rather than keeping their own tally, which
    // is how the two screens stopped being able to disagree.
    //
    // Only today's, because the question each row asks is "has anybody rung
    // back since this came in" and not "how many times have we ever tried".
    // The record asks the second one and answers it over the whole history.
    const known = Object.values(records).flat()
    const attempts: Record<string, string[]> = {}
    if (known.length) {
      const { data: tries } = await supabase
        .from('patient_notes')
        .select('patient_id, created_at')
        .eq('clinic_id', clinicId)
        .eq('kind', 'contacto')
        .in(
          'patient_id',
          known.map((k) => k.id)
        )
        .gte('created_at', dayStart.toISOString())
        .order('created_at', { ascending: false })
      for (const row of (tries ?? []) as Array<{ patient_id: string; created_at: string }>) {
        ;(attempts[row.patient_id] ??= []).push(row.created_at)
      }
    }

    const porting = (clinic?.porting_details ?? null) as {
      current_number?: string
      forward_type?: ForwardType
      forward_done?: boolean
    } | null
    const owed =
      clinic?.status === 'ativa' &&
      clinic?.phone_source === 'ported' &&
      !!clinic?.assigned_phone &&
      !porting?.forward_done

    return (
      <>
        <AgendaLive clinicId={clinicId} />
        <BillingLive clinicId={clinicId} />
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="h-display text-3xl sm:text-4xl">{dict.agenda.messagesTitle}</h1>
            <p className="mt-1 text-lg text-ink-soft">{dict.agenda.messagesLead}</p>
          </div>
          <LiveBar
            clinicId={clinicId}
            renderedAt={now.toISOString()}
            locale={locale}
            liveLabel={dict.agenda.live}
            lostLabel={dict.agenda.liveLost}
            retryLabel={dict.agenda.liveRetry}
            updatedLabel={dict.agenda.updated}
          />
        </div>

        {owed && (
          <div className="mb-6">
            <ForwardingCard
              telmaNumber={clinic!.assigned_phone!}
              ownNumber={porting?.current_number ?? null}
              forwardType={porting?.forward_type ?? null}
              dict={dict}
              dismissable
              readOnly={readOnly}
            />
          </div>
        )}

        <MessagesDay
          calls={dayCalls}
          records={records}
          attempts={attempts}
          week={week}
          dayKey={dayKeyIn(tz, day)}
          todayKey={dayKeyIn(tz, now)}
          yesterdayKey={dayKeyIn(tz, dayIn(tz, -1, now))}
          heading={weekdayDateIn(day.toISOString(), locale, tz)}
          readOnly={readOnly}
          dict={dict}
          locale={locale}
        />

        {billingOnly && (
          <div className="mt-10">
            <MinutesProgressCard
              quiet
              minutes={billingOnly.minutes}
              pack={packOnly}
              canBuy={!readOnly}
              dict={dict}
              locale={locale}
            />
          </div>
        )}
      </>
    )
  }

  // Everything this screen needs, asked for at once. The minutes and the pack
  // used to be a second round after this one had come back, which made the
  // morning screen wait twice: they depend on nothing here, so they wait with
  // the rest.
  const [
    dayRes,
    pendingRes,
    cancelledRes,
    cancelledTodayRes,
    callsRes,
    slotsRes,
    blockedRes,
    billing,
    pack,
  ] = await Promise.all([
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
    // ── HOW MANY HOURS THIS DAY HAS TO GIVE ──────────────────────────────
    // The week has said "3 de 8 ocupadas" since it existed and the day could
    // not: the screen a clinic opens every morning was the one that could not
    // say how full the morning was. It needs the same two rows the planner
    // reads, for this one day.
    supabase.from('availability_slots').select('*').eq('clinic_id', clinicId),
    supabase
      .from('blocked_days')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('day', dayKeyIn(tz, day)),
    // Same row, already in hand on this request.
    getClinicWithPlan(clinicId, clinic),
    getMinutePackOffer(),
  ])

  const dayAppointments = (dayRes.data ?? []) as Appointment[]
  const pending = (pendingRes.data ?? []) as Appointment[]
  const cancelled = (cancelledRes.data ?? []) as Appointment[]
  const calls = (callsRes.data ?? []) as Call[]

  const t = dict.agenda
  const counts = {
    // Answered, which is what the label says. A call that ended while it rang
    // belongs in the figure beside it, not in this one: counting it here
    // would make "chamadas atendidas" the number of calls that arrived.
    calls: calls.filter((c) => c.channel === 'telefone' && c.result !== 'nao_atendida').length,
    missed: calls.filter((c) => c.result === 'nao_atendida').length,
    whatsapp: calls.filter((c) => c.channel === 'whatsapp').length,
    bookings: calls.filter((c) => c.result === 'marcacao').length,
    info: calls.filter((c) => c.result === 'informacao').length,
    cancelled: cancelledTodayRes.count ?? 0,
  }

  const dayKey = dayKeyIn(tz, day)

  // The same arithmetic the planner does, for one day: the windows the clinic
  // opens on this weekday, cut into bookable starts.
  const windows = ((slotsRes.data ?? []) as AvailabilitySlot[]).filter(
    (s) => s.active && s.weekday === weekdayIn(tz, day)
  )
  const openStarts = startsIn(
    windows,
    clinic?.slot_minutes ?? 60,
    clinic?.appointment_duration_minutes ?? 30
  ).length
  const facts = dayFacts(
    dayAppointments,
    openStarts,
    ((blockedRes.data ?? []) as BlockedDay[]).length > 0
  )

  // The minutes, and whether they are worth interrupting the day over.
  //
  // Under 80% the card is a status line and sits with the rest of the summary,
  // below what Telma already handled — the reassurance the receptionist opens
  // this screen for. Past that it is news, and news that stops Telma booking
  // goes above everything, because finding out from a patient is worse than
  // finding out from a card.
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
  // ── A CLINIC THAT HAS NOT BEEN SET UP GETS THE SETUP, NOT THE DAY ────────
  // It has a number and no hours and no services, so the agenda would be an
  // empty list under a screen of counters reading zero: a product that looks
  // broken rather than one that has not been started. This is the whole screen
  // until it is done, and then it is never seen again.
  const awaitingSetup = clinic?.status === 'por_configurar'

  // A clinic that kept its own number has to point it at ours, and nothing in
  // the product told it how until now. It stays on the agenda until the clinic
  // says it has done it: we cannot read an operator's switch, so there is no
  // fact to check and the clinic is the one who knows.
  const porting = (clinic?.porting_details ?? null) as {
    current_number?: string
    forward_type?: ForwardType
    forward_done?: boolean
  } | null
  // Only once she is actually answering. 'por_configurar' is a clinic that has
  // not told Telma anything yet and 'pausada' is one whose payment has not
  // landed; forwarding a real telephone into either is worse than not
  // forwarding it at all, and the clinic would not find out.
  const needsForwarding =
    clinic?.status === 'ativa' &&
    clinic?.phone_source === 'ported' &&
    !!clinic?.assigned_phone &&
    !porting?.forward_done

  const minutesUrgent = billing
    ? billing.minutes.exhausted || percentUsed(billing.minutes.used, billing.minutes.allowance) >= 80
    : false

  // ── THE SET-UP HAS ITS OWN ADDRESS NOW ────────────────────────────────
  // It used to render here: a clinic that had just paid opened the panel,
  // read "Agenda" at the top and found "when is the clinic open?" underneath.
  // Every screen makes one promise and the agenda's is what is happening
  // today; a form is not that. /comecar is where it lives, and it is where
  // this lands until there is a day to show.
  if (awaitingSetup) redirect('/comecar')

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

      {needsForwarding && (
        <div className="mb-6">
          <ForwardingCard
            telmaNumber={clinic!.assigned_phone!}
            ownNumber={porting?.current_number ?? null}
            forwardType={porting?.forward_type ?? null}
            dict={dict}
            dismissable
            readOnly={readOnly}
          />
        </div>
      )}

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

      {/* How full it is, and whether it is asking for anything. The same
          component each card in the week draws, so one fact is not phrased two
          ways at two zooms. */}
      <div className="mb-4">
        <DayLoad facts={facts} dict={dict} large />
      </div>

      <AgendaDay
        appointments={dayAppointments}
        clinic={clinic ?? {}}
        // One instant for the whole day, so every countdown on screen agrees
        // with every other and with the server that drew them.
        serverNow={new Date().toISOString()}
        dict={dict}
        locale={locale}
        tz={tz}
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
