import type { ReactNode } from 'react'

type Tone = 'neutral' | 'pending' | 'ok' | 'warn' | 'danger' | 'info'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-brand-wash text-ink-soft',
  pending: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-brand text-white',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${toneClass[tone]}`}>{children}</span>
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow eyebrow-mark mb-3">{eyebrow}</p>}
        <h1 className="h-display text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-lg text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center text-lg text-ink-mute">{children}</div>
  )
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft px-6 py-8 text-center">
      <p className="font-mid text-xl font-semibold text-danger">{title}</p>
      <p className="mt-2 text-base text-ink-soft">{message}</p>
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <div className="card p-5">
      <p className="label-caps">{label}</p>
      <p className="mt-2 font-mid text-3xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-mute">{hint}</p>}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 font-mid text-xl font-semibold text-ink">{children}</h2>
}
