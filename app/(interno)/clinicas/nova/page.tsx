import Link from 'next/link'
import { getDict } from '@/lib/i18n'
import { PageHeader } from '@/components/ui'
import { ClinicForm } from '@/components/ClinicForm'

export const dynamic = 'force-dynamic'

export default async function NovaClinicaPage() {
  const { dict } = await getDict()
  return (
    <>
      <Link href="/clinicas" className="mb-4 inline-block text-base text-ink-mute hover:text-accent">
        ← {dict.common.back}
      </Link>
      <PageHeader eyebrow={dict.internoNav.clinicas} title={dict.interno.newTitle} subtitle={dict.interno.newHelp} />
      <div className="max-w-3xl">
        <ClinicForm dict={dict} />
      </div>
    </>
  )
}
