import type { ReactNode } from 'react'
import type { AppointmentStatus, CallResult } from '@/lib/types'

type Tone = 'neutral' | 'pending' | 'ok' | 'warn' | 'danger' | 'info'

// One tone per state, defined once. A booking that is amber on one screen and
// grey on the next teaches the reader that the colour means nothing.
//
// 'cancelada' is amber, not red: nothing went wrong, but a slot just opened and
// somebody has to notice. Red is kept for the clinic's own refusal.
export const APPOINTMENT_TONE: Record<AppointmentStatus, Tone> = {
  pendente: 'pending',
  confirmada: 'ok',
  copiada: 'ok',
  rejeitada: 'danger',
  cancelada: 'warn',
  // Grey, not amber: nothing went wrong and nobody has to act. The window
  // closed and the hour is back on sale, which is the system working.
  expirada: 'neutral',
}

export const CALL_TONE: Record<CallResult, Tone> = {
  marcacao: 'ok',
  transferida: 'info',
  informacao: 'neutral',
  nao_resolvida: 'danger',
}

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
      <p className="text-xl font-semibold text-danger">{title}</p>
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
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-mute">{hint}</p>}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 text-xl font-semibold text-ink">{children}</h2>
}
