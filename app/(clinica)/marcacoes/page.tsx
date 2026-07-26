import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, ErrorState } from '@/components/ui'
import { AppointmentCard } from '@/components/AppointmentCard'
import type { Appointment } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MarcacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const { f } = await searchParams
  const onlyPending = f === 'pending'
  const { locale, dict } = await getDict()
  const supabase = await createClient()

  let query = supabase
    .from('appointments')
    .select('*')
    .order('status', { ascending: true })
    .order('scheduled_at', { ascending: true })
  if (onlyPending) query = query.eq('status', 'pendente')

  const { data, error } = await query
  const appts = (data ?? []) as Appointment[]
  // Pending first, then the rest by most recent.
  appts.sort((a, b) => {
    if (a.status === 'pendente' && b.status !== 'pendente') return -1
    if (a.status !== 'pendente' && b.status === 'pendente') return 1
    return a.status === 'pendente'
      ? +new Date(a.scheduled_at) - +new Date(b.scheduled_at)
      : +new Date(b.created_at) - +new Date(a.created_at)
  })

  const tab = (key: 'all' | 'pending', label: string) => {
    const active = key === 'pending' ? onlyPending : !onlyPending
    return (
      <Link
        href={key === 'pending' ? '/marcacoes?f=pending' : '/marcacoes'}
        className={`rounded-full px-4 py-2 text-base font-medium ${
          active ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.marcacoes} title={dict.marcacoes.title} subtitle={dict.marcacoes.help} />

      <div className="mb-6 inline-flex rounded-full border border-line-strong bg-paper p-1">
        {tab('all', dict.marcacoes.filterAll)}
        {tab('pending', dict.marcacoes.filterPending)}
      </div>

      {error ? (
        <ErrorState title={dict.common.errorTitle} message={dict.common.errorGeneric} />
      ) : appts.length === 0 ? (
        <EmptyState>{dict.marcacoes.empty}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {appts.map((appt) => (
            <AppointmentCard key={appt.id} appt={appt} dict={dict} locale={locale} />
          ))}
        </div>
      )}
    </>
  )
}
