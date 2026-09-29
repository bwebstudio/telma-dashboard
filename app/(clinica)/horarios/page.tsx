import { createClient } from '@/lib/supabase/server'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'
import { OpeningHours } from '@/components/OpeningHours'
import { BlockedDaysManager } from '@/components/BlockedDaysManager'
import type { AvailabilitySlot, BlockedDay, Resource } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function HorariosPage() {
  const { locale, dict } = await getDict()
  const { clinicId, clinic, readOnly } = await requireClinicContext()
  const supabase = await createClient()

  const tz = clinic?.timezone || 'Europe/Lisbon'

  // The blocked days are still configuration: they are the exceptions written
  // into the rule, not appointments. The weeks and months the rule produces
  // moved to the agenda, where a calendar of real bookings belongs.
  const [blockedRes, resourcesRes, slotsRes] = await Promise.all([
    supabase
      .from('blocked_days')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('day', { ascending: true }),
    supabase
      .from('resources')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .order('sort')
      .order('created_at'),
    // The hour grid below is drawn from these: they are the rule itself.
    supabase.from('availability_slots').select('*').eq('clinic_id', clinicId),
  ])
  const blocked = (blockedRes.data ?? []) as BlockedDay[]
  const resources = (resourcesRes.data ?? []) as Resource[]
  const slots = (slotsRes.data ?? []) as AvailabilitySlot[]

  return (
    <>
      <PageHeader eyebrow={dict.clinicNav.horarios} title={dict.horarios.title} />

      <section className="mb-12">
        <SectionTitle>{dict.horarios.gridTitle}</SectionTitle>
        <div className="mb-5 rounded-2xl bg-brand px-5 py-4 text-white">
          <p className="text-lg font-medium">{dict.horarios.help}</p>
        </div>
        <div className="card p-5 sm:p-6">
          <OpeningHours
            slots={slots}
            step={clinic?.slot_minutes ?? 60}
            resources={resources}
            dict={dict}
            readOnly={readOnly}
          />
        </div>
      </section>

      <section>
        <SectionTitle>{dict.horarios.blockedTitle}</SectionTitle>
        <p className="mb-5 text-base text-ink-soft">{dict.horarios.blockedHelp}</p>
        <div className="card p-5 sm:p-6">
          <BlockedDaysManager days={blocked} dict={dict} locale={locale} readOnly={readOnly} />
        </div>
      </section>
    </>
  )
}
