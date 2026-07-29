'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CrmStage } from '@/lib/crm/types'
import type { CrmStrings } from '@/lib/crm/strings'
import { IconPhone, IconChevron } from '@/components/icons'
import { LogSheet } from './LogSheet'

// One card per clinic. Mobile first on purpose: a rep never sees a wide table.
// The phone number is the biggest thing on the card because dialling is the
// action, and it is a real tel: link so it is one tap, not copy and paste.

export interface ProspectRow {
  id: string
  name: string
  phone: string | null
  zone: string | null
  stage: CrmStage
  /** Formatted on the server, in the clinic's own timezone. */
  whenLabel: string | null
  overdue: boolean
  lateBy: string | null
  lastNote: string | null
  lastResultLabel: string | null
  repLabel: string | null
}

export function ProspectCards({
  rows,
  strings,
  emptyMessage,
  showStage = false,
}: {
  rows: ProspectRow[]
  strings: CrmStrings
  emptyMessage: string
  showStage?: boolean
}) {
  const t = strings
  const [logging, setLogging] = useState<ProspectRow | null>(null)

  if (rows.length === 0) {
    return (
      <div className="card px-6 py-10 text-center text-lg text-ink-mute">{emptyMessage}</div>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`rounded-2xl border p-4 ${
              row.overdue ? 'border-warn/45 bg-warn-soft' : 'border-line bg-paper'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <Link href={`/crm/prospetos/${row.id}`} className="min-w-0 flex-1">
                <p className="font-serif text-lg font-semibold leading-snug text-ink">
                  {row.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-soft">
                  {row.whenLabel && (
                    <span className={row.overdue ? 'font-semibold text-warn' : 'font-semibold'}>
                      {row.whenLabel}
                      {row.overdue && row.lateBy ? ` · ${row.lateBy} ${t.lateBy}` : ''}
                    </span>
                  )}
                  {row.zone && <span>{row.zone}</span>}
                  {showStage && <span>{t.stage[row.stage]}</span>}
                  {row.repLabel && <span>{row.repLabel}</span>}
                </p>
              </Link>
              <IconChevron className="mt-1 h-5 w-5 shrink-0 text-ink-mute" />
            </div>

            {(row.lastNote || row.lastResultLabel) && (
              <p className="mt-2 line-clamp-2 text-base text-ink-soft">
                {row.lastResultLabel && (
                  <span className="font-medium text-ink">{row.lastResultLabel}</span>
                )}
                {row.lastResultLabel && row.lastNote ? ' · ' : ''}
                {row.lastNote}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {row.phone ? (
                <a
                  href={`tel:${row.phone.replace(/\s/g, '')}`}
                  className="flex min-h-[3rem] flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-paper hover:bg-accent-dark"
                >
                  <IconPhone className="h-5 w-5" />
                  {row.phone}
                </a>
              ) : (
                <span className="flex min-h-[3rem] flex-1 items-center justify-center rounded-xl border border-dashed border-line-strong px-4 text-base text-ink-mute">
                  {t.noPhone}
                </span>
              )}
              <button
                type="button"
                onClick={() => setLogging(row)}
                className="min-h-[3rem] shrink-0 rounded-xl border border-ink/25 px-4 text-base font-semibold text-ink hover:border-ink hover:bg-ink hover:text-paper"
              >
                {t.logShort}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {logging && (
        <LogSheet
          prospectId={logging.id}
          prospectName={logging.name}
          strings={strings}
          onClose={() => setLogging(null)}
        />
      )}
    </>
  )
}
