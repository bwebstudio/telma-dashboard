import Link from 'next/link'
import type { Dictionary, Locale } from '@/content'
import { formatDate } from '@/lib/format'
import { fill } from '@/lib/fill'
import { SectionTitle } from '@/components/ui'

export interface OpenFollowUp {
  id: string
  name: string
  phone: string
  follow_up_since: string
  follow_up_reason: string | null
}

/**
 * Everybody the clinic still owes something to, oldest first.
 *
 * The follow-up itself lives on each record, which is right: that is where
 * somebody with a patient on the telephone looks. But the question a
 * receptionist has on a Monday morning is the other way round, "who are we
 * still waiting on", and that cannot be answered by opening fifteen records
 * one at a time.
 *
 * Oldest first, because the one that has been open longest is the one
 * somebody forgot. It disappears entirely when there is nothing open: an
 * empty box with a heading on it is a thing to scroll past every day.
 */
export function FollowUpQueue({
  rows,
  dict,
  locale,
}: {
  rows: OpenFollowUp[]
  dict: Dictionary
  locale: Locale
}) {
  if (!rows.length) return null
  const t = dict.pacientes

  return (
    <section className="mb-8">
      <SectionTitle>{fill(t.followQueueTitle, { n: rows.length })}</SectionTitle>
      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/pacientes/${row.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card border border-warn/40 bg-warn-soft px-4 py-3 transition-colors duration-fast ease-calm hover:border-warn"
            >
              <span className="min-w-0">
                <span className="block font-medium text-ink">{row.name}</span>
                {row.follow_up_reason && (
                  <span className="mt-0.5 block text-base text-ink-soft">
                    {row.follow_up_reason}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm text-ink-mute">
                {t.followOpen.replace('{date}', formatDate(row.follow_up_since, locale))}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
