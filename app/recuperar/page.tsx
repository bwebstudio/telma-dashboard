import Link from 'next/link'
import { getDict } from '@/lib/i18n'
import { ResetRequestForm } from '@/components/ResetRequestForm'

/**
 * Asking for a way back in.
 *
 * There was none. A clinic signs up, is shown a temporary password once on the
 * final screen, and if that tab closes before anybody copies it the account is
 * unreachable for good: no email is stored, no reset exists, and the only fix
 * was signing the clinic up again under a different address. Fine while the
 * only accounts were ours. Not fine with a paying client.
 *
 * The one design decision worth naming is the answer. It is the same whether
 * the address has an account or not, because a page that says "no such user"
 * tells anybody who asks which clinics are clients.
 */

export const dynamic = 'force-dynamic'

export default async function RecuperarPage() {
  const { dict } = await getDict()

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-4xl font-semibold tracking-tight text-ink">Telma</p>
          <p className="label-caps mt-2">{dict.auth.subtitle}</p>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-ink">{dict.auth.resetTitle}</h1>
          <p className="mt-2 text-base text-ink-soft">{dict.auth.resetLead}</p>
          <ResetRequestForm dict={dict} />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-ink-soft hover:text-brand-accent">
            {dict.auth.resetBack}
          </Link>
        </p>
      </div>
    </main>
  )
}
