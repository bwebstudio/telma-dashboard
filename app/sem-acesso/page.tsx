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

export default async function SemAcessoPage() {
  const user = await getAppUser()
  if (!user) redirect('/login')
  // Somebody who does have a panel should never see this page: send them to it.
  const [panel] = panelsFor(user)
  if (panel) redirect('/')

  const { dict } = await getDict()
  const t = dict.noAccess

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
