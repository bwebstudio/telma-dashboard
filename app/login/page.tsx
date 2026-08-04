import { getDict } from '@/lib/i18n'
import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const { dict } = await getDict()

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
          <LoginForm dict={dict} />
        </div>
      </div>
    </main>
  )
}
