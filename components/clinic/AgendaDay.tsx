import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import type { Appointment, AppointmentStatus } from '@/lib/types'
import { timeIn } from '@/lib/time'
import { Badge, APPOINTMENT_TONE } from '@/components/ui'
import { IconPhone, IconWhatsApp } from '@/components/icons'

/**
 * The agenda speaks three words: confirmed, to confirm, cancelled.
 *
 * The database keeps more — "copiada" means the booking reached the clinic's
 * own software, "rejeitada" means the clinic turned it down rather than the
 * patient calling off. Both are worth recording and neither changes what the
 * day looks like: the appointment is either happening, waiting for an answer,
 * or not happening. Five labels down a column taught the reader to stop and
 * work out the difference, which is the opposite of what a day view is for.
 * The full state is still on the booking's own card in Marcações.
 */
const SHOWN_AS: Record<AppointmentStatus, 'confirmada' | 'pendente' | 'cancelada'> = {
  confirmada: 'confirmada',
  copiada: 'confirmada',
  pendente: 'pendente',
  cancelada: 'cancelada',
  rejeitada: 'cancelada',
}

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
 */
export function AgendaDay({
  appointments,
  dict,
  locale,
  tz,
  isToday,
}: {
  appointments: Appointment[]
  dict: Dictionary
  locale: Locale
  /** The clinic's zone. The hours on screen are the clinic's hours. */
  tz: string
  isToday: boolean
}) {
  const t = dict.agenda
  const rows = [...appointments].sort(
    (a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
  )

  if (rows.length === 0) {
    return <div className="card px-6 py-12 text-center text-lg text-ink-mute">{t.emptyDay}</div>
  }

  const now = Date.now()
  // The index the "now" line goes before. Only meaningful on today.
  const nowAt = isToday
    ? rows.findIndex((a) => +new Date(a.scheduled_at) > now)
    : -1
  const allPast = isToday && nowAt === -1

  return (
    <ol className="card divide-y divide-line overflow-hidden">
      {rows.map((appt, i) => (
        <li key={appt.id}>
          {nowAt === i && <NowLine label={t.now} />}
          <Row appt={appt} dict={dict} locale={locale} tz={tz} />
        </li>
      ))}
      {allPast && (
        <li>
          <NowLine label={t.now} />
        </li>
      )}
    </ol>
  )
}

function NowLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 bg-brand-wash px-4 py-1.5 sm:px-5" aria-hidden>
      <span className="text-xs font-semibold uppercase tracking-label text-brand-accent">
        {label}
      </span>
      <span className="h-px flex-1 bg-brand-accent/40" />
    </div>
  )
}

function Row({
  appt,
  dict,
  locale,
  tz,
}: {
  appt: Appointment
  dict: Dictionary
  locale: Locale
  tz: string
}) {
  const cancelled = appt.status === 'cancelada'
  const refused = appt.status === 'rejeitada'
  const off = cancelled || refused

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 sm:gap-5 sm:px-5 ${
        cancelled ? 'bg-warn-soft/50' : ''
      }`}
    >
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
