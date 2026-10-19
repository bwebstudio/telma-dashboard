import Link from 'next/link'
import { requireClinicContext } from '@/lib/clinic-context'
import { getDict } from '@/lib/i18n'
import { PageHeader, SectionTitle } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * How somebody gets in, and nothing else.
 *
 * One card on its own page, which looks thin and is the point: it was a
 * paragraph in the middle of a screen about the clinic, the plan, the
 * invoices and the subscription, and the thing it asks -- change the password
 * we emailed you -- is the one on that screen with a deadline on it. A page
 * it can be sent to is worth more than the space it saves.
 */
export default async function SegurancaPage() {
  const { dict } = await getDict()
  const { user } = await requireClinicContext()

  return (
    <>
      <PageHeader eyebrow={dict.conta.accountMenu} title={dict.conta.securityTitle} />

      <section className="card max-w-2xl p-6">
        <SectionTitle>{dict.conta.accessTitle}</SectionTitle>
        <dl className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-mute">{dict.common.email}</dt>
            <dd className="text-right text-ink">{user?.email || '·'}</dd>
          </div>
        </dl>
        <p className="mb-4 max-w-prose text-base text-ink-soft">{dict.conta.accessHelp}</p>
        <Link href="/nova-palavra-passe" className="btn-secondary inline-flex">
          {dict.conta.changePassword}
        </Link>
      </section>
    </>
  )
}
