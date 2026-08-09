import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { panelsFor } from '@/lib/access'
import { signOut } from '@/lib/actions/session'
import { getDict } from '@/lib/i18n'
import { showcaseMode } from '@/lib/demo/config'

/**
 * Signed in, and nowhere to go.
 *
 * Until this existed the app sent that person back to /login, and the middleware
 * saw a valid session on /login and sent them to /, and / worked out they had no
 * panel and sent them back to /login. A loop that ends on the sign-in screen,
 * which everybody reads as a wrong password. Somebody spent a good while
 * retyping a password that was right.
 *
 * It happens whenever a role has no panel, and a showcase makes that ordinary:
 * there is one panel, the clinic's, and an internal or sales account has no
 * business drawing it. Rather than pretend the account is broken, this says what
 * is true and offers the two ways forward.
 */

export const dynamic = 'force-dynamic'

const COPY = {
  pt: {
    title: 'Esta conta não abre nada aqui',
    demo: 'Esta é a demonstração da Telma, e só tem o painel de uma clínica. A sua conta é da equipa, e essas contas ficam no painel verdadeiro.',
    plain: 'A sua conta entrou, mas não tem nenhum painel associado. Fale connosco e resolvemos.',
    signUp: 'Inscrever uma clínica',
    out: 'Sair',
  },
  es: {
    title: 'Esta cuenta no abre nada aquí',
    demo: 'Esta es la demostración de Telma, y solo tiene el panel de una clínica. Su cuenta es del equipo, y esas cuentas viven en el panel de verdad.',
    plain: 'Su cuenta ha entrado, pero no tiene ningún panel asociado. Hable con nosotros y lo resolvemos.',
    signUp: 'Dar de alta una clínica',
    out: 'Salir',
  },
} as const

export default async function SemAcessoPage() {
  const user = await getAppUser()
  if (!user) redirect('/login')
  // Somebody who does have a panel should never see this page: send them to it.
  const [panel] = panelsFor(user)
  if (panel) redirect('/')

  const { locale } = await getDict()
  const t = COPY[locale === 'es' ? 'es' : 'pt']

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-5 py-16">
      <div>
        <h1 className="h-display text-2xl sm:text-3xl">{t.title}</h1>
        <p className="mt-3 text-base text-ink-soft">{showcaseMode() ? t.demo : t.plain}</p>
        <p className="mt-2 text-sm text-ink-mute">{user.email}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/inscricao" className="btn-primary">
          {t.signUp}
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn-secondary">
            {t.out}
          </button>
        </form>
      </div>
    </main>
  )
}
