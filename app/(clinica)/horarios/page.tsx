import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { AvailabilityGrid } from '@/components/AvailabilityGrid'
import { BlockedDaysManager } from '@/components/BlockedDaysManager'
import type { AvailabilitySlot, BlockedDay } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HorariosPage() {
  const { locale, dict } = await getDict()
  const supabase = await createClient()

  const [slotsRes, blockedRes] = await Promise.all([
    supabase.from('availability_slots').select('*'),
    supabase.from('blocked_days').select('*').order('day', { ascending: true }),
  ])

  const slots = (slotsRes.data ?? []) as AvailabilitySlot[]
  const blocked = (blockedRes.data ?? []) as BlockedDay[]

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.horarios} title={dict.horarios.title} />

      <div className="mb-6 rounded-2xl bg-brand px-5 py-4 text-white">
        <p className="text-lg font-medium">{dict.horarios.help}</p>
      </div>

      <div className="card mb-10 p-5 sm:p-6">
        <AvailabilityGrid slots={slots} dict={dict} />
      </div>

      <section>
        <SectionTitle>{dict.horarios.blockedTitle}</SectionTitle>
        <p className="mb-5 text-base text-ink-soft">{dict.horarios.blockedHelp}</p>
        <div className="card p-5 sm:p-6">
          <BlockedDaysManager days={blocked} dict={dict} locale={locale} />
        </div>
      </section>
    </>
  )
}
