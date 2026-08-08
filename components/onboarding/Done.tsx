'use client'

import { useEffect, useState } from 'react'
import type { OnboardingResult } from '@/lib/actions/onboarding'
import { copyFor } from '@/lib/onboarding/copy'
import { PromptPreview } from './PromptPreview'
import type { OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * The screen that shows the temporary password.
 *
 * It exists because the password is shown exactly once and never stored in a
 * form we can read back. The email carries the same thing, but email arrives
 * late, arrives in spam, or arrives at an address somebody mistyped two minutes
 * ago, and none of those should mean a clinic cannot get into the panel it just
 * paid for.
 *
 * There is no URL for this. It is state held by the wizard that produced it, so
 * a refresh loses it: a credential in an address bar is a credential in browser
 * history, in the referer of the first outbound link, and in every screenshot
 * somebody sends to support.
 */
export function Done({
  result,
  locale,
  values,
}: {
  result: OnboardingResult
  locale: OnboardingLocale
  /** The answers that produced this clinic, so the prompt can be shown and
   *  copied here too. Step 5 is behind them now and there is no way back. */
  values: Record<string, unknown>
}) {
  const t = copyFor(locale)
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow eyebrow-mark mb-3">{t.doneEyebrow}</p>
        <h2 className="h-display text-3xl sm:text-4xl">{t.doneTitle}</h2>
        <p className="mt-3 max-w-lead text-lg text-ink-soft">
          {t.doneLead.replace('{email}', result.email)}
        </p>
      </div>

      {result.demo && (
        <p className="rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-base text-warn">
          {t.doneDemo}
        </p>
      )}

      <div className="card divide-y divide-line">
        <div className="p-5">
          <p className="label-caps">
            {result.temporaryNumber ? t.donePorting : t.doneNumber}
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink">{result.phoneNumber}</p>
          {result.temporaryNumber && (
            <p className="mt-1 text-sm text-ink-mute">{t.donePortingNote}</p>
          )}
        </div>

        <div className="p-5">
          <p className="label-caps">{t.doneCredentials}</p>
          <Copyable label={t.email} value={result.email} copyLabel={t.copy} copiedLabel={t.copied} />
          <Copyable
            label={t.donePassword}
            value={result.password}
            copyLabel={t.copy}
            copiedLabel={t.copied}
            mono
          />
          <p className="mt-2 text-sm text-ink-mute">{t.donePasswordHelp}</p>
        </div>
      </div>

      <div>
        <a href={`${result.dashboardUrl}/login`} className="btn-primary">
          {t.doneOpenPanel}
        </a>
      </div>

      {/* The same panel as step 5. It is worth repeating here because this is
          the screen somebody keeps open, and because the prompt is what gets
          pasted into the agent to test what Telma would answer. */}
      <PromptPreview values={values} locale={locale} />

      <div>
        <h3 className="text-lg font-semibold text-ink">{t.doneNextTitle}</h3>
        <ol className="mt-3 flex flex-col gap-2.5">
          {t.doneNext.map((line, i) => (
            <li key={line} className="flex gap-3 text-base text-ink-soft">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-brand-wash text-sm font-medium text-brand-accent">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/**
 * A value with a copy button.
 *
 * The password is sixteen characters of deliberately unambiguous nonsense.
 * Retyping it by hand is how somebody ends up locked out of an account they
 * created ninety seconds ago.
 */
function Copyable({
  label,
  value,
  copyLabel,
  copiedLabel,
  mono,
}: {
  label: string
  value: string
  copyLabel: string
  copiedLabel: string
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // No clipboard permission. The value is on screen and selectable, which
      // is the fallback: nothing is lost, only the shortcut.
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm text-ink-mute">{label}</span>
        <span
          className={[
            'block break-all text-base text-ink',
            mono ? 'font-medium tracking-snug [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]' : '',
          ].join(' ')}
        >
          {value}
        </span>
      </span>
      <button type="button" onClick={copy} className="btn-secondary min-h-0 px-3.5 py-1.5 text-sm">
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}
