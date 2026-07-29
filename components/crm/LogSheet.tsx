'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CRM_RESULTS, type CrmResult } from '@/lib/crm/types'
import type { CrmStrings } from '@/lib/crm/strings'
import { newClientRef, submitActivity } from '@/lib/crm/queue'
import { IconClose } from '@/components/icons'

// Logging a call. This is the screen that has to work standing up, one handed,
// between two visits, so:
//   - every result is a chip, one tap, no dropdown
//   - the note is a plain textarea, which is what makes the phone keyboard
//     offer dictation; nothing here interferes with it
//   - the next reminder is four presets, the date picker is the exception
//   - Save sits at the bottom of the screen and never scrolls away
// Two taps (result, save) is the whole flow when there is nothing to add.

type NextChoice = 'none' | '2h' | 'tomorrow9' | 'tomorrow14' | 'custom'

function atTomorrow(hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

function inHours(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000)
}

// Value for <input type="datetime-local">, which wants local time, not UTC.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export function LogSheet({
  prospectId,
  prospectName,
  strings,
  onClose,
}: {
  prospectId: string
  prospectName: string
  strings: CrmStrings
  onClose: () => void
}) {
  const t = strings
  const router = useRouter()
  const [result, setResult] = useState<CrmResult | null>(null)
  const [note, setNote] = useState('')
  const [next, setNext] = useState<NextChoice>('none')
  const [customAt, setCustomAt] = useState(toLocalInput(atTomorrow(10)))
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Stop the page behind from scrolling under the sheet.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  function nextDate(): Date | null {
    switch (next) {
      case '2h':
        return inHours(2)
      case 'tomorrow9':
        return atTomorrow(9)
      case 'tomorrow14':
        return atTomorrow(14)
      case 'custom':
        return customAt ? new Date(customAt) : null
      default:
        return null
    }
  }

  const nextLabels: Record<NextChoice, string> = {
    none: t.log.noNext,
    '2h': t.log.inTwoHours,
    tomorrow9: t.log.tomorrowMorning,
    tomorrow14: t.log.tomorrowAfternoon,
    custom: t.log.pickDateTime,
  }

  async function save() {
    if (!result) {
      setWarn(t.log.needResult)
      return
    }
    setSaving(true)
    setWarn(null)

    const when = nextDate()
    const outcome = await submitActivity({
      client_ref: newClientRef(),
      prospect_id: prospectId,
      type: 'call',
      result,
      note: note.trim() || null,
      next_action_at: when ? when.toISOString() : null,
      next_action_text: when ? (note.trim() || t.result[result]) : null,
      created_at: new Date().toISOString(),
    })

    setSaving(false)
    if (outcome === 'queued') {
      // Nothing is lost: it sits in localStorage until there is coverage.
      window.setTimeout(() => onClose(), 1400)
      setWarn(t.log.queued)
      router.refresh()
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-paper"
      role="dialog"
      aria-modal="true"
      aria-label={`${t.logCall} · ${prospectName}`}
      ref={dialogRef}
      tabIndex={-1}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="label-caps">{t.log.title}</p>
          <p className="truncate font-serif text-lg font-semibold text-ink">{prospectName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.log.close}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-3 hover:text-ink"
        >
          <IconClose className="h-6 w-6" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <fieldset>
          <legend className="label-caps mb-2">{t.log.what}</legend>
          <div className="grid grid-cols-2 gap-2">
            {CRM_RESULTS.map((r) => {
              const on = result === r
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setResult(r)
                    setWarn(null)
                  }}
                  className={`flex min-h-[3.25rem] items-center justify-center rounded-2xl border px-3 text-center text-base font-medium leading-tight transition-colors ${
                    on
                      ? 'border-accent bg-accent text-paper'
                      : 'border-line-strong bg-paper text-ink hover:border-ink'
                  }`}
                >
                  {t.result[r]}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <label htmlFor="crm-note" className="label-caps mb-2 block">
            {t.log.note}
          </label>
          <textarea
            id="crm-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t.log.notePlaceholder}
            className="w-full rounded-2xl border border-line-strong bg-paper px-3.5 py-3 text-base text-ink placeholder:text-ink-mute focus:border-accent"
          />
        </div>

        <fieldset className="mt-3">
          <legend className="label-caps mb-2">{t.log.next}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['2h', 'tomorrow9', 'tomorrow14', 'custom'] as NextChoice[]).map((c) => {
              const on = next === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setNext(on && c !== 'custom' ? 'none' : c)}
                  className={`flex min-h-[3rem] items-center justify-center rounded-2xl border px-3 text-base font-medium transition-colors ${
                    on
                      ? 'border-pine bg-pine text-paper'
                      : 'border-line-strong bg-paper text-ink hover:border-ink'
                  }`}
                >
                  {nextLabels[c]}
                </button>
              )
            })}
          </div>
          {next === 'custom' && (
            <input
              type="datetime-local"
              value={customAt}
              onChange={(e) => setCustomAt(e.target.value)}
              aria-label={t.log.pickDateTime}
              className="field-input mt-2"
            />
          )}
        </fieldset>
      </div>

      <footer className="border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {warn && (
          <p role="status" className="mb-2 text-center text-base font-medium text-warn">
            {warn}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-paper transition-colors hover:bg-accent-dark disabled:opacity-60"
        >
          {saving ? t.log.saving : t.log.save}
        </button>
      </footer>
    </div>
  )
}
