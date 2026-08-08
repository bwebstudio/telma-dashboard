import Link from 'next/link'
import { formatDateTime } from '@/lib/format'
import type { MockCallReport, MockCallStep } from '@/lib/mock-call'
import type { Dictionary, Locale } from '@/content'

const TONE: Record<MockCallReport['outcome'], 'ok' | 'warn' | 'info'> = {
  booked: 'ok',
  transferred: 'info',
  informed: 'info',
  no_minutes: 'warn',
  no_slots: 'warn',
  error: 'warn',
}

const FRAME: Record<'ok' | 'warn' | 'info', string> = {
  ok: 'border-ok/40 bg-ok-soft',
  warn: 'border-warn/40 bg-warn-soft',
  info: 'border-line-strong bg-surface-sunken',
}

const STEP_MARK: Record<MockCallStep['state'], string> = {
  ok: '✓',
  blocked: '×',
  skipped: '–',
}

const STEP_TEXT: Record<MockCallStep['state'], string> = {
  ok: 'text-ok',
  blocked: 'text-warn',
  skipped: 'text-ink-mute',
}

/**
 * What the call did, and which of the agent's requests it took to get there.
 *
 * The trace is the part worth reading. Anybody can be told that a booking was
 * made; seeing that the agent asked for the clinic's context, was told which
 * times were free, and only then wrote the booking is what makes the product
 * legible — and what makes an empty agenda or an exhausted plan explain itself
 * instead of looking like a bug.
 */
export function MockCallResult({
  report,
  dict,
  locale,
}: {
  report: MockCallReport
  dict: Dictionary
  locale: Locale
}) {
  const t = dict.testCall
  const tone = TONE[report.outcome]
  const outcome = t.outcomes[report.outcome]

  return (
    <section className={`rounded-card border p-6 ${FRAME[tone]}`} aria-live="polite">
      <h2 className="text-xl font-semibold text-ink">{outcome.title}</h2>
      <p className="mt-1 text-base text-ink-soft">
        {outcome.description.replace('{name}', report.patient_name)}
      </p>

      {/* The trace ------------------------------------------------------- */}
      <ol className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
        {report.steps.map((step) => (
          <li key={step.key} className="flex items-baseline gap-3 text-base">
            <span aria-hidden className={`w-4 shrink-0 ${STEP_TEXT[step.state]}`}>
              {STEP_MARK[step.state]}
            </span>
            <span className={step.state === 'skipped' ? 'text-ink-mute' : 'text-ink'}>
              {t.steps[step.key]}
            </span>
            {step.detail && (
              <span className="ml-auto text-sm text-ink-mute tabular-nums">
                {step.key === 'availability'
                  ? formatDateTime(step.detail, locale)
                  : step.key === 'call'
                    ? `${step.detail} ${t.minutesWord}`
                    : step.detail}
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* What it cost ---------------------------------------------------- */}
      <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-base">
        <Row label={t.patientName} value={report.patient_name} />
        <Row
          label={t.duration}
          value={`${report.duration_seconds / 60} ${t.minutesWord}`}
        />
        {report.appointment_at && (
          <Row label={t.bookedFor} value={formatDateTime(report.appointment_at, locale)} />
        )}
        <Row
          label={t.meter}
          value={`${report.minutes_before} → ${report.minutes_after} / ${report.allowance}`}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-base">
        <Link href="/hoje" className="font-medium text-brand-accent hover:text-brand-hover">
          {t.seeAgenda}
        </Link>
        <Link href="/conta" className="font-medium text-brand-accent hover:text-brand-hover">
          {t.seeAccount}
        </Link>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right font-medium text-ink tabular-nums">{value}</dd>
    </div>
  )
}
