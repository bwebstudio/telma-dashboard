'use client'

import { useActionState, useState } from 'react'
import { clearSimulatedCalls, simulateCall } from '@/lib/actions/mock-call'
import { MockCallResult } from './MockCallResult'
import { MOCK_DURATION_MAX, MOCK_DURATION_MIN, MOCK_RESULT_TYPES } from '@/lib/mock-call'
import type { Dictionary, Locale } from '@/content'

/**
 * The three shapes a call takes, as somebody explaining the product would tell
 * them apart: one ends in a booking, one ends at the reception desk, one ends
 * with an answered question. Everything else the agent does is a variation of
 * these.
 */
export function MockCallForm({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.testCall
  const [minutes, setMinutes] = useState(3)
  const [report, action, pending] = useActionState(simulateCall, null)
  const [cleared, clearAction, clearing] = useActionState(clearSimulatedCalls, null)

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="card flex flex-col gap-5 p-6">
        <div>
          <label className="field-label" htmlFor="mock-name">
            {t.patientName}
          </label>
          <input
            id="mock-name"
            name="patient_name"
            type="text"
            required
            maxLength={80}
            defaultValue="João Silva"
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="mock-phone">
            {dict.common.phone}
          </label>
          <input
            id="mock-phone"
            name="patient_phone"
            type="tel"
            required
            defaultValue="+351 912 345 678"
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="mock-duration">
            {t.duration}: {minutes} {t.minutesWord}
          </label>
          <input
            id="mock-duration"
            name="duration_minutes"
            type="range"
            min={MOCK_DURATION_MIN}
            max={MOCK_DURATION_MAX}
            step={1}
            value={minutes}
            disabled={pending}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="h-11 w-full accent-brand"
          />
          <div className="flex justify-between text-sm text-ink-mute tabular-nums">
            <span>
              {MOCK_DURATION_MIN} {t.minutesWord}
            </span>
            <span>
              {MOCK_DURATION_MAX} {t.minutesWord}
            </span>
          </div>
        </div>

        <fieldset>
          <legend className="field-label">{t.resultType}</legend>
          <div className="flex flex-col gap-2">
            {MOCK_RESULT_TYPES.map((value, index) => (
              <label
                key={value}
                className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 rounded-input border border-line-strong bg-surface p-3 transition-colors duration-fast ease-calm hover:border-ink/25 has-[:checked]:border-brand-accent has-[:checked]:bg-brand-wash"
              >
                <input
                  type="radio"
                  name="result_type"
                  value={value}
                  defaultChecked={index === 0}
                  className="mt-1 h-5 w-5 shrink-0 accent-brand"
                />
                <span>
                  <span className="block font-medium text-ink">{t.results[value].label}</span>
                  <span className="block text-sm text-ink-soft">{t.results[value].help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {report?.error && (
          <p role="alert" className="rounded-input bg-danger-soft px-4 py-3 text-base text-danger">
            {t.errors[report.error]}
          </p>
        )}

        <button type="submit" className="btn-primary w-full sm:w-auto sm:self-start" disabled={pending}>
          {pending ? t.working : t.submit}
        </button>
      </form>

      {report && !report.error && (
        <MockCallResult report={report} dict={dict} locale={locale} />
      )}

      {/* Everything a simulation writes is tagged, so the agenda can be put
          back the way it was. The meter is not rewound: usage is what a clinic
          is billed on, and a test page must not be able to edit it. */}
      <form action={clearAction} className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-ghost px-0" disabled={clearing}>
          {clearing ? t.working : t.clear}
        </button>
        {cleared && (
          <span role="status" className="text-sm text-ink-mute">
            {cleared.removed} {t.cleared}
          </span>
        )}
      </form>
    </div>
  )
}
