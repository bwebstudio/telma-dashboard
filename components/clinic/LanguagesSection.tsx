'use client'

import { useState, useTransition } from 'react'
import { updateClinicLanguages } from '@/lib/actions/clinic-settings'

/**
 * Which languages Telma answers in, and how many more the plan allows.
 *
 * The count is the point of the screen. "2 de 3" answers both questions a
 * clinic has here at once — what am I on, and is there room — and it is the
 * sentence the commercial model is built around: your plan includes up to N,
 * choose which. A list without the count would make somebody count.
 *
 * The base language is drawn checked and disabled. It is not a choice: a clinic
 * that stopped speaking the language of the country it is in would leave every
 * caller who dialled expecting it with nobody to talk to.
 */

export interface LanguageRow {
  code: string
  name: string
  status: 'available' | 'coming_soon' | 'deprecated'
}

export function LanguagesSection({
  languages,
  selected,
  base,
  max,
  readOnly,
  labels,
}: {
  languages: LanguageRow[]
  selected: string[]
  base: string
  /** Null is unlimited. */
  max: number | null
  readOnly: boolean
  labels: {
    title: string
    help: string
    count: string
    base: string
    soon: string
    full: string
    save: string
    saving: string
    saved: string
    tooMany: string
    error: string
    readOnly: string
  }
}) {
  const [chosen, setChosen] = useState<string[]>(
    selected.length ? selected : [base]
  )
  const [state, setState] = useState<'idle' | 'saved' | 'error' | 'too_many'>('idle')
  const [pending, startTransition] = useTransition()

  const atMax = max !== null && chosen.length >= max
  // Compared as sets rather than by index: reordering is not a change, and a
  // Save button that lights up because an array moved teaches people to ignore
  // it.
  const dirty =
    chosen.length !== selected.length || chosen.some((c) => !selected.includes(c))

  function toggle(code: string) {
    if (code === base || readOnly) return
    setState('idle')
    setChosen((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  function save() {
    startTransition(async () => {
      const r = await updateClinicLanguages(chosen)
      setState(r.ok ? 'saved' : r.error === 'too_many' ? 'too_many' : 'error')
    })
  }

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-ink">{labels.title}</h2>
        {max !== null && (
          <p className="text-base text-ink-mute">
            {labels.count.replace('{n}', String(chosen.length)).replace('{max}', String(max))}
          </p>
        )}
      </div>
      <p className="mt-1.5 text-base text-ink-soft">{labels.help}</p>

      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {languages.map((l) => {
          const isBase = l.code === base
          const on = chosen.includes(l.code)
          const soon = l.status !== 'available'
          const disabled = readOnly || isBase || soon || (!on && atMax)
          return (
            <label
              key={l.code}
              aria-disabled={disabled}
              className={[
                'flex items-center justify-between gap-3 rounded-card border p-3.5 transition-all duration-fast ease-calm',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                on
                  ? 'border-brand bg-brand-wash'
                  : soon || (!on && atMax)
                    ? 'border-line bg-surface-sunken opacity-60'
                    : 'border-line bg-surface hover:border-ink/20',
              ].join(' ')}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => toggle(l.code)}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
                <span className="truncate text-base text-ink">{l.name}</span>
              </span>
              {(isBase || soon) && (
                <span className="shrink-0 text-sm text-ink-mute">
                  {isBase ? labels.base : labels.soon}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {atMax && !readOnly && <p className="mt-3 text-sm text-ink-mute">{labels.full}</p>}
      {readOnly && <p className="mt-3 text-sm text-ink-mute">{labels.readOnly}</p>}

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="btn-primary"
          >
            {pending ? labels.saving : labels.save}
          </button>
          {state === 'saved' && !dirty && (
            <span className="text-base text-ok">{labels.saved}</span>
          )}
          {state === 'too_many' && (
            <span role="alert" className="text-base font-medium text-danger">
              {labels.tooMany}
            </span>
          )}
          {state === 'error' && (
            <span role="alert" className="text-base font-medium text-danger">
              {labels.error}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
