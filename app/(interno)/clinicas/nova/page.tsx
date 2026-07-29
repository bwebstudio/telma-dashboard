import Link from 'next/link'
import { getDict } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { fetchProspect } from '@/lib/crm/data'
import { PageHeader } from '@/components/ui'
import { ClinicForm } from '@/components/ClinicForm'

export const dynamic = 'force-dynamic'

// Also the landing point of "Converter em cliente" in the CRM: with
// ?prospect=<id> the form arrives prefilled with what the rep already knows,
// and the alta is still completed by hand with the plan, the schedule and the
// assigned number. Converting a prospect is never automatic.
export default async function NovaClinicaPage({
  searchParams,
}: {
  searchParams: Promise<{ prospect?: string }>
}) {
  const { prospect: prospectId } = await searchParams
  const { dict } = await getDict()

  let defaults: { name?: string; phone?: string; address?: string } = {}
  if (prospectId) {
    const supabase = await createClient()
    const prospect = await fetchProspect(supabase, prospectId)
    if (prospect) {
      defaults = {
        name: prospect.name,
        phone: prospect.phone ?? '',
        address: prospect.address ?? prospect.zone ?? '',
      }
    }
  }

  return (
    <>
      <Link href="/clinicas" className="mb-4 inline-block text-base text-ink-mute hover:text-accent">
        ← {dict.common.back}
      </Link>
      <PageHeader eyebrow={dict.internoNav.clinicas} title={dict.interno.newTitle} subtitle={dict.interno.newHelp} />
      <div className="max-w-3xl">
        <ClinicForm dict={dict} defaults={defaults} prospectId={prospectId} />
      </div>
    </>
  )
}
