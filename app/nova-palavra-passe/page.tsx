import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n'
import { NewPasswordForm } from '@/components/NewPasswordForm'

/**
 * Choosing the new password.
 *
 * Only reachable with the session the recovery link just created, which is what
 * makes it safe: there is no token in this page and nothing to guess. Somebody
 * who arrives without one is sent to ask for a link.
 */

export const dynamic = 'force-dynamic'

export default async function NovaPalavraPassePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/recuperar')

  const { dict } = await getDict()

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-4xl font-semibold tracking-tight text-ink">Telma</p>
          <p className="label-caps mt-2">{user.email}</p>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-ink">{dict.auth.newTitle}</h1>
          <p className="mt-2 text-base text-ink-soft">{dict.auth.newLead}</p>
          <NewPasswordForm dict={dict} />
        </div>
      </div>
    </main>
  )
}
