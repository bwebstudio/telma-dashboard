import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchReps, requireCrmSession } from '@/lib/crm/data'
import { NewProspectForm } from '@/components/crm/NewProspectForm'

export const dynamic = 'force-dynamic'

export default async function NovoProspetoPage() {
  const { isAdmin, rep, dict } = await requireCrmSession()
  const supabase = await createClient()
  const reps = isAdmin ? await fetchReps(supabase) : []

  return (
    <>
      <Link
        href="/crm/prospetos"
        className="mb-2 inline-flex min-h-[2.75rem] items-center text-base text-ink-mute hover:text-brand-accent"
      >
        ← {dict.common.back}
      </Link>
      <div className="mb-5">
        <h1 className="h-display text-3xl">{dict.crm.novo.title}</h1>
        <p className="mt-2 text-lg text-ink-soft">{dict.crm.novo.help}</p>
      </div>
      <div className="max-w-2xl">
        <NewProspectForm
          dict={dict}
          reps={reps}
          isAdmin={isAdmin}
          defaultCountry={rep?.country ?? 'PT'}
        />
      </div>
    </>
  )
}
