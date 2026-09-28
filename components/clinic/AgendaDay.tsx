import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import type { Appointment } from '@/lib/types'
import { timeIn } from '@/lib/time'
import { SHOWN_AS } from '@/lib/agenda-facts'
import { bookingCategory, categoryBackground } from '@/lib/service-colour'
import { resolveDuration, type DurationSource } from '@/lib/service-duration'
import { Badge, APPOINTMENT_TONE } from '@/components/ui'
import { IconPhone, IconWhatsApp } from '@/components/icons'
import { ConfirmButton } from './ConfirmButton'
import { SeenButton } from './SeenButton'

/**
 * The day, in the order it happens.
 *
 * This is the screen the clinic actually opens the panel for, so it is a list
 * and not a calendar grid: a grid spends its space on empty hours, and on a
 * phone it spends it on nothing at all. The reader wants "who, when, and is it
 * settled" in one pass down the left edge.
 *
 * A cancelled slot stays in place rather than disappearing. The hour is still
 * information — it is now free, and the person reading is the one who can fill
 * it. Removing the row would hide exactly the thing worth knowing.
 *
 * ── AND THE ANSWER IS ON THE ROW ───────────────────────────────────────────
 * Confirming and acknowledging used to live only in the band above, which
 * meant every appointment waiting for an answer was drawn twice on one screen:
 * once up there with a button, once down here in its hour. The same four
 * names, the same cancellation note, read twice on the way down. Reported as
 * confusing, and it is: a reader cannot tell whether the two lists are the
 * same thing or two different things until they compare them.
 *
 * The answer belongs where the appointment is, beside the hour it is at and
 * the reason it is for. The band keeps only what is not on this day.
 */
export function AgendaDay({
  appointments,
  clinic,
  dict,
  locale,
  tz,
  readOnly = false,
}: {
  appointments: Appointment[]
  /** What the clinic offers, to colour a booking by what it is for. The week
   *  has had this since it existed and the day had not, so the same booking
   *  was a coloured chip on Tuesday's card and a plain row on Tuesday. */
  clinic: DurationSource
  dict: Dictionary
  locale: Locale
  /** The clinic's zone. The hours on screen are the clinic's hours. */
  tz: string
  /** False for the clinic, true for an administrator visiting. */
  readOnly?: boolean
}) {
  const t = dict.agenda
  const rows = [...appointments].sort(
    (a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
  )

  if (rows.length === 0) {
    return <div className="card px-6 py-12 text-center text-lg text-ink-mute">{t.emptyDay}</div>
  }

  return (
    <ol className="card divide-y divide-line overflow-hidden">
      {rows.map((appt) => (
        <li key={appt.id}>
          <Row appt={appt} clinic={clinic} dict={dict} locale={locale} tz={tz} readOnly={readOnly} />
        </li>
      ))}
    </ol>
  )
}


function Row({
  appt,
  clinic,
  dict,
  locale,
  tz,
  readOnly,
}: {
  appt: Appointment
  clinic: DurationSource
  dict: Dictionary
  locale: Locale
  tz: string
  /** True while an administrator is visiting. Answering for a clinic is the
   *  clinic's to do, so the buttons are not drawn at all rather than drawn and
   *  refused. */
  readOnly: boolean
}) {
  const cancelled = appt.status === 'cancelada'
  const refused = appt.status === 'rejeitada'
  const off = cancelled || refused

  // The same colour the week gives it, from the same two lines. A booking that
  // is not happening gets none: the hour is the information now, not what it
  // was going to be for.
  const colour = off
    ? null
    : bookingCategory(resolveDuration(clinic, appt.reason ?? null).service_id, appt.reason)

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 sm:gap-5 sm:px-5 ${
        cancelled ? 'bg-warn-soft/50' : ''
      }`}
    >
      {/* A bar and not a dot: down a list of twelve it is the left edge the eye
          runs along, and a dot beside the hour competes with the hour. */}
      <span
        aria-hidden
        className="-my-3.5 w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: colour ? categoryBackground(colour.index) : 'transparent' }}
      />
      {/* The hour carries the whole scan, so it is the biggest thing in the
          row and it never wraps. */}
      <span
        className={`w-14 shrink-0 pt-0.5 text-lg tabular-nums sm:w-16 sm:text-xl ${
          off ? 'text-ink-mute line-through' : 'font-semibold text-ink'
        }`}
      >
        {timeIn(appt.scheduled_at, locale, tz)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`text-base font-medium sm:text-lg ${
              off ? 'text-ink-mute line-through' : 'text-ink'
            }`}
          >
            {appt.patient_name}
          </span>
          <span
            className="text-ink-mute"
            title={dict.status.channel[appt.origin]}
            aria-label={dict.status.channel[appt.origin]}
          >
            {appt.origin === 'whatsapp' ? (
              <IconWhatsApp className="h-4 w-4" />
            ) : (
              <IconPhone className="h-4 w-4" />
            )}
          </span>
        </div>

        {appt.reason && (
          <p className={`text-base ${off ? 'text-ink-mute' : 'text-ink-soft'}`}>{appt.reason}</p>
        )}

        {/* The badge already says "cancelled". What the row adds is the part
            that changes what somebody does next: who called it off and why. */}
        {cancelled && (appt.cancelled_by === 'paciente' || appt.cancel_reason) && (
          <p className="mt-1 text-base font-medium text-warn">
            {appt.cancelled_by === 'paciente' && dict.agenda.cancelledBy}
            {appt.cancel_reason && (
              <span className="font-normal text-ink-soft">
                {appt.cancelled_by === 'paciente' ? ' · ' : ''}
                {appt.cancel_reason}
              </span>
            )}
          </p>
        )}
        {refused && appt.reject_reason && (
          <p className="mt-1 text-base text-ink-mute">{appt.reject_reason}</p>
        )}

        <a
          href={`tel:${appt.patient_phone}`}
          className="mt-1 inline-block text-base text-ink-soft underline decoration-line-strong underline-offset-4 sm:hidden"
        >
          {appt.patient_phone}
        </a>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge tone={APPOINTMENT_TONE[SHOWN_AS[appt.status]]}>
          {dict.status.appointment[SHOWN_AS[appt.status]]}
        </Badge>

        {/* The answer, beside the thing being answered. A booking waiting on
            the clinic is the only row on the day that asks for something, and
            what it asks for is one click. */}
        {!readOnly && appt.status === 'pendente' && (
          <div className="mt-1">
            <ConfirmButton id={appt.id} label={dict.marcacoes.confirm} />
          </div>
        )}
        {/* A cancellation asks for nothing except to be read, and stays in the
            warm tint until somebody says so. */}
        {!readOnly && cancelled && !appt.cancel_seen_at && (
          <div className="mt-1">
            <SeenButton id={appt.id} label={dict.agenda.seen} />
          </div>
        )}

        {appt.call_id && (
          <Link
            href={`/conversas?c=${appt.call_id}`}
            className="hidden text-sm text-brand-accent hover:text-brand-hover sm:inline"
          >
            {dict.agenda.openConversation}
          </Link>
        )}
      </div>
    </div>
  )
}
