import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import type { Appointment } from '@/lib/types'
import { ConfirmButton } from './ConfirmButton'
import { SeenButton } from './SeenButton'
import { PreAppointmentCountdown } from './PreAppointmentCountdown'
import { smartStamp } from '@/lib/time'
import { IconPhone, IconWhatsApp } from '@/components/icons'

/**
 * The only part of the panel that is allowed to shout.
 *
 * Two things belong here and nothing else: bookings nobody has answered, and
 * bookings a patient called off in the last day. Both change what a person has
 * to do in the next ten minutes; everything else on the screen is context.
 *
 * It sits between the day's tally and the day itself, not at the very top.
 * Opening the panel straight onto a stack of unanswered things reads as a list
 * of problems and people bounce off it; the counters above soften the landing,
 * and this is what to do about it.
 *
 * A cancellation stays until somebody presses "Já vi". Nothing here ages out
 * on a timer — a timer either nags about what is already handled or drops what
 * nobody read.
 *
 * One line each, not a card each. Full cards pushed the day itself off the
 * screen. A line is enough to decide on, Confirmar is right there for the
 * answer given nine times out of ten, and the full record is one tap away for
 * the tenth.
 *
 * When it is empty it says so, in a sentence. An empty state that renders as
 * nothing looks like a page that failed to load — and the whole point of this
 * band is that its silence has to be trustworthy.
 */
export function AttentionBand({
  pending,
  cancelled,
  dict,
  locale,
  tz,
  readOnly,
  serverNow,
}: {
  pending: Appointment[]
  cancelled: Appointment[]
  dict: Dictionary
  locale: Locale
  tz: string
  readOnly: boolean
  /** When the server drew this. The zero the countdowns count from. */
  serverNow: string
}) {
  const t = dict.agenda
  const total = pending.length + cancelled.length

  if (total === 0) {
    return (
      <section className="flex items-center gap-3 rounded-card border border-ok/25 bg-ok-soft px-5 py-4">
        <Check />
        <p className="text-base font-medium text-ok sm:text-lg">{t.attentionNone}</p>
      </section>
    )
  }

  return (
    <section aria-label={t.attention} className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-sunken px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold text-ink">{t.attention}</h2>
        <span className="badge bg-warn-soft text-warn">{total}</span>
      </div>

      <ul className="divide-y divide-line">
        {cancelled.map((appt) => (
          <li
            key={appt.id}
            className="bg-warn-soft/60 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="shrink-0 text-base font-semibold text-warn">{t.justCancelled}</span>
              <span className="text-base text-ink">
                {appt.patient_name}
                <span className="text-ink-soft"> · {smartStamp(appt.scheduled_at, locale, tz)}</span>
              </span>
              {appt.cancel_reason && (
                <span className="w-full text-base text-ink-soft sm:w-auto sm:before:mr-1 sm:before:content-['·']">
                  {appt.cancel_reason}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="mt-3 shrink-0 sm:mt-0">
                <SeenButton id={appt.id} label={t.seen} />
              </div>
            )}
          </li>
        ))}

        {/* On a phone the answer sits under what it is answering, not beside
            it: a badge, a name and two controls on one line leaves the name
            wrapping around the badge and nothing reads in order. */}
        {pending.map((appt) => (
          <li
            key={appt.id}
            className="px-4 py-3 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:px-5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                <span className="badge shrink-0 bg-warn-soft text-warn">{t.needsAnswer}</span>
                <span className="font-medium text-ink">{appt.patient_name}</span>
                <span className="text-ink-mute" aria-label={dict.status.channel[appt.origin]}>
                  {appt.origin === 'whatsapp' ? (
                    <IconWhatsApp className="h-4 w-4" />
                  ) : (
                    <IconPhone className="h-4 w-4" />
                  )}
                </span>
                <span className="text-ink-soft">{smartStamp(appt.scheduled_at, locale, tz)}</span>
                {appt.reason && <span className="text-ink-soft">· {appt.reason}</span>}
              </div>

              {/* How long is left of the hold. Under the booking rather than
                  beside it: the deadline is a fact about this line, and on a
                  phone a fourth thing on the same row pushes the name into a
                  wrap nobody can read. */}
              <PreAppointmentCountdown
                appointment={appt}
                serverNow={serverNow}
                labels={{
                  confirmIn: t.holdConfirmIn,
                  critical: t.holdCritical,
                  expired: t.holdExpired,
                  aria: t.holdAria,
                }}
              />
            </div>

            <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-0">
              {!readOnly && <ConfirmButton id={appt.id} label={dict.marcacoes.confirm} />}
              <Link
                href="/marcacoes?f=pending"
                className="text-base text-brand-accent hover:text-brand-hover"
              >
                {dict.interno.openFicha}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 text-ok"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  )
}
