'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Yesterday, today, tomorrow — and a date field for anything else.
 *
 * Three named days cover almost every reason a receptionist changes the date,
 * and they are one tap. The picker is there for the rest without taking the
 * space a full calendar would.
 */
export function DaySwitcher({
  current,
  today,
  yesterday,
  tomorrow,
  labels,
}: {
  current: string
  today: string
  yesterday: string
  tomorrow: string
  labels: { before: string; today: string; after: string; pick: string }
}) {
  const router = useRouter()

  const Tab = ({ day, label }: { day: string; label: string }) => {
    const active = current === day
    return (
      <Link
        href={day === today ? '/hoje' : `/hoje?d=${day}`}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex min-h-[2.5rem] items-center rounded-pill px-4 text-base font-medium transition-colors ${
          active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-brand-wash hover:text-ink'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-pill border border-line-strong bg-surface p-1">
        <Tab day={yesterday} label={labels.before} />
        <Tab day={today} label={labels.today} />
        <Tab day={tomorrow} label={labels.after} />
      </div>
      <input
        type="date"
        aria-label={labels.pick}
        value={current}
        onChange={(e) => {
          const v = e.target.value
          if (v) router.push(v === today ? '/hoje' : `/hoje?d=${v}`)
        }}
        className="min-h-[2.5rem] rounded-input border border-line-strong bg-surface px-3 text-base text-ink"
      />
    </div>
  )
}
