import { getDict } from '@/lib/i18n'
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expirado?: string }>
}) {
  const { dict } = await getDict()
  // The recovery link sends people here when it has expired or been used. Saying
  // nothing would leave them staring at a sign-in form with no idea why they are
  // back on it, which is the failure this whole flow exists to end.
  const { expirado } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-4xl font-semibold tracking-tight text-ink">
            Telma
          </p>
          <p className="label-caps mt-2">{dict.auth.subtitle}</p>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="mb-6 text-2xl font-semibold text-ink">
            {dict.auth.title}
          </h1>
          {expirado && (
            <p
              role="alert"
              className="mb-5 rounded-card border border-warn/30 bg-warn/5 px-4 py-3 text-sm font-medium text-warn"
            >
              {dict.auth.newExpired}
            </p>
          )}
          <LoginForm dict={dict} />
        </div>
      </div>
    </main>
  )
}
