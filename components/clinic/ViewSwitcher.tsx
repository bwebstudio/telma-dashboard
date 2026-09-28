import Link from 'next/link'

/**
 * Day, week, month: the same diary at three distances.
 *
 * It sits under the page title rather than beside the date controls, because
 * it changes what the screen IS and they change what it is showing. Putting a
 * "which day" control and a "which kind of view" control in the same row taught
 * the reader to check which one they were about to press.
 */
export function ViewSwitcher({
  current,
  labels,
}: {
  current: 'dia' | 'semana' | 'mes'
  labels: { dia: string; semana: string; mes: string }
}) {
  const views = ['dia', 'semana', 'mes'] as const
  return (
    <nav
      aria-label={labels.dia}
      className="inline-flex items-center gap-1 rounded-pill border border-line-strong bg-surface p-1"
    >
      {views.map((v) => {
        const on = v === current
        return (
          <Link
            key={v}
            href={v === 'dia' ? '/hoje' : `/hoje?v=${v}`}
            aria-current={on ? 'page' : undefined}
            className={`min-h-[2.25rem] rounded-pill px-4 text-base font-medium transition-colors ${
              on ? 'bg-ink text-white' : 'text-ink-soft hover:bg-brand-wash hover:text-ink'
            }`}
          >
            {labels[v]}
          </Link>
        )
      })}
    </nav>
  )
}
