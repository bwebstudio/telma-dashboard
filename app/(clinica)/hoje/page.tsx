import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, EmptyState, SectionTitle } from '@/components/ui'
import { AppointmentCard } from '@/components/AppointmentCard'
import { CallItem } from '@/components/CallItem'
import { HojeLive } from '@/components/HojeLive'
import type { Appointment, Call } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HojePage() {
  const { locale, dict } = await getDict()
  // Row Level Security already scopes a clinic user to its own rows, but the
  // administrator visiting this panel is not scoped by anything: every query
  // here filters by the clinic explicitly, so no screen can ever show two
  // clinics mixed together.
  const { clinicId, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [pendingRes, callsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'pendente')
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('calls')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false }),
  ])

  const pending = (pendingRes.data ?? []) as Appointment[]
  const calls = (callsRes.data ?? []) as Call[]

  return (
    <>
      <PageHeader
        eyebrow={dict.clinicNav.hoje}
        title={dict.hoje.title}
        subtitle={dict.hoje.greeting}
        action={<HojeLive clinicId={clinicId} label={dict.hoje.live} />}
      />

      <section className="mb-10">
        <SectionTitle>{dict.hoje.pendingTitle}</SectionTitle>
        {pending.length === 0 ? (
          <EmptyState>{dict.hoje.pendingEmpty}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                dict={dict}
                locale={locale}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>{dict.hoje.callsTitle}</SectionTitle>
          <Link href="/chamadas" className="text-base text-brand-accent hover:text-brand-hover">
            {dict.hoje.seeAll}
          </Link>
        </div>
        {calls.length === 0 ? (
          <EmptyState>{dict.hoje.callsEmpty}</EmptyState>
        ) : (
          <div className="card px-4 sm:px-5">
            {calls.map((call) => (
              <CallItem key={call.id} call={call} dict={dict} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
