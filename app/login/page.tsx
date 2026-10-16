import { getDict } from '@/lib/i18n'
import { LoginForm } from '@/components/LoginForm'
import { TelmaMark } from '@/components/TelmaMark'

export const dynamic = 'force-dynamic'

/**
 * THE DOOR.
 *
 * Split in two, and the two halves are not decoration and content: they are
 * the two products. The left is the panel — near-black, the mark in white,
 * the same ground the sidebar stands on, so the screen a clinic signs in
 * through already looks like the place it is going. The site's own door is
 * the inverse, black on macaw. Those two grounds are the whole of how the
 * public thing and the private thing are told apart, and this is the one
 * screen where a person sees the hand-off happen.
 *
 * The dark half is hidden below lg. It carries no information — the mark
 * moves above the card on a phone — and half a screen of near-black above a
 * form is a worse phone screen, not a more branded one.
 *
 * ── THE LINE UNDER THE FORM, AND WHY IT IS NOT A SECOND BUTTON ─────────────
 * Somebody arrives here from the site's "Entrar" without having bought
 * anything. Today that person can only fail: there is no row for them. Our
 * `users` table requires a clinic — role_clinic_consistency in 0001_init —
 * so an account with no clinic is not a state the panel can hold. Sending
 * them to the sign-up is therefore the only honest answer, and it is a quiet
 * line rather than a second button because the people who need it are a small
 * minority of the people who land here.
 */
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
  const t = dict.auth

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-[#0B0B0B] p-12 lg:flex">
        <div className="flex items-center gap-3">
          <TelmaMark className="h-5 w-auto text-white" />
          <span className="text-lg font-medium tracking-tight text-white">Telma</span>
        </div>
        {/* Two children, so justify-between puts the mark at the top and the
            line at the foot and nothing has to be positioned. The subtitle is
            deliberately not repeated down here: it is already under the
            heading on the other half, and a screen this empty makes a repeat
            look like a mistake rather than an echo. */}
        <p className="max-w-[18ch] text-4xl font-semibold leading-[1.1] tracking-tight text-white">
          {t.panelLine}
        </p>
      </aside>

      <div className="flex items-center justify-center px-5 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#0B0B0B]">
              <TelmaMark className="h-3.5 w-auto text-white" />
            </span>
            <span className="text-lg font-medium tracking-tight text-ink">Telma</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-2 text-base text-ink-soft">{t.subtitle}</p>

          {expirado && (
            <p
              role="alert"
              className="mt-6 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-sm font-medium text-warn"
            >
              {t.newExpired}
            </p>
          )}

          <div className="mt-8">
            <LoginForm dict={dict} />
          </div>

          <p className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-soft">
            {t.noAccount}{' '}
            <a href="/inscricao" className="font-medium text-ink underline underline-offset-4">
              {t.signUp}
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
