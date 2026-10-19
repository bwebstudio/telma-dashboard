import { cookies } from 'next/headers'
import { setDemoRole, setDemoStage } from '@/lib/actions/session'
import { DEMO_STAGE_COOKIE, readDemoStage, type DemoStage } from '@/lib/demo/config'
import type { UserRole } from '@/lib/types'

// Shown only in demo mode. Lets you preview both panels without logging in,
// and lets you choose which morning you are looking at: the one a clinic finds
// after signing up, or the same clinic weeks later with a day in it.
export async function DemoBar({ role }: { role: UserRole }) {
  const stage = readDemoStage((await cookies()).get(DEMO_STAGE_COOKIE)?.value)

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface-sunken px-4 py-3">
      <p className="text-sm text-ink-soft">
        <span className="label-caps mr-2">Demo</span>
        Dados de exemplo. Nada é gravado e tudo volta ao início ao recarregar o servidor.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Only on the clinic's own panel. The internal and sales panels do
            not have a first morning: they are ours, and they are never empty. */}
        {role === 'clinica' && (
          <div className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface p-1">
            <StageBtn value="nova" label="Acabada de inscrever" stage={stage} />
            <StageBtn value="trabalho" label="A trabalhar" stage={stage} />
          </div>
        )}

        {/* The first minute in the panel, on demand. It is shown once to a
            real clinic and then never again, which leaves nobody -- us
            included -- able to look at it a second time. */}
        <a href="/hoje?tour=1" className="text-sm font-medium text-brand-accent hover:text-brand-hover">
          Ver o tour
        </a>

        <div className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface p-1">
          <RoleBtn value="clinica" label="Clínica" role={role} />
          <RoleBtn value="interno" label="Interno" role={role} />
          <RoleBtn value="comercial" label="Comercial" role={role} />
        </div>
      </div>
    </div>
  )
}

const PILL = 'rounded-full px-3 py-1 text-sm font-medium'

function RoleBtn({ value, label, role }: { value: UserRole; label: string; role: UserRole }) {
  return (
    <form action={setDemoRole}>
      <input type="hidden" name="role" value={value} />
      <button
        type="submit"
        aria-pressed={role === value}
        className={`${PILL} ${role === value ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
      >
        {label}
      </button>
    </form>
  )
}

function StageBtn({
  value,
  label,
  stage,
}: {
  value: DemoStage
  label: string
  stage: DemoStage
}) {
  return (
    <form action={setDemoStage}>
      <input type="hidden" name="stage" value={value} />
      <button
        type="submit"
        aria-pressed={stage === value}
        className={`${PILL} ${stage === value ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
      >
        {label}
      </button>
    </form>
  )
}
