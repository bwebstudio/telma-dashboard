import { notFound } from 'next/navigation'
import { isDemo } from '@/lib/demo/config'
import { mockCallsEnabled } from '@/lib/mock-call'
import { stripeConfigured } from '@/lib/onboarding/stripe-client'
import { twilioConfigured } from '@/lib/onboarding/twilio-provisioner'
import { TestRunner } from '@/components/onboarding/TestRunner'

/**
 * The sign-up, end to end, without filling anything in.
 *
 * Same gate as the simulated call, for the same reason: this creates a clinic,
 * a login and a week of slots, and none of that belongs in production. It is
 * also the fastest way to see the whole flow when a step or a column changes,
 * which is when it usually breaks.
 *
 * It sits behind the session gate on purpose. It writes as much as the internal
 * "nova clínica" screen does, and that screen has never been public.
 */

export const dynamic = 'force-dynamic'

export default async function TestOnboardingPage() {
  if (!mockCallsEnabled()) notFound()

  // What is real right now. Read here rather than inside the runner so the
  // report is read against a state the reader can already see.
  const env = [
    { label: 'Base de dados', on: !isDemo(), off: 'Modo demo, em memória', on_: 'Supabase' },
    { label: 'Twilio', on: twilioConfigured(), off: 'Número fictício', on_: 'Compra a sério' },
    { label: 'Stripe', on: stripeConfigured(), off: 'Sem cobrança', on_: 'Checkout a sério' },
    {
      label: 'Email',
      on: Boolean(process.env.RESEND_API_KEY),
      off: 'Impresso no log',
      on_: 'Resend',
    },
  ]

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <p className="eyebrow eyebrow-mark mb-3">Ferramenta interna</p>
      <h1 className="h-display text-3xl sm:text-4xl">Testar a inscrição</h1>
      <p className="mt-3 max-w-lead text-lg text-ink-soft">
        Corre os seis passos contra as mesmas server actions que o formulário usa, conclui a
        inscrição e depois lê a base de dados para confirmar o que ficou lá. Cria linhas a sério.
      </p>

      <div className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {env.map((e) => (
          <div key={e.label} className="card p-4">
            <p className="label-caps">{e.label}</p>
            <p className={`mt-1.5 text-base ${e.on ? 'text-ink' : 'text-ink-mute'}`}>
              {e.on ? e.on_ : e.off}
            </p>
          </div>
        ))}
      </div>

      <TestRunner />
    </div>
  )
}
