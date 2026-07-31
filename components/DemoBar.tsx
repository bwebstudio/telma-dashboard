import { setDemoRole } from '@/lib/actions/session'
import type { UserRole } from '@/lib/types'

// Shown only in demo mode. Lets you preview both panels without logging in.
export function DemoBar({ role }: { role: UserRole }) {
  const Btn = ({ value, label }: { value: UserRole; label: string }) => (
    <form action={setDemoRole}>
      <input type="hidden" name="role" value={value} />
      <button
        type="submit"
        aria-pressed={role === value}
        className={`rounded-full px-3 py-1 text-sm font-medium ${
          role === value ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
        }`}
      >
        {label}
      </button>
    </form>
  )
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-surface-sunken px-4 py-3">
      <p className="text-sm text-ink-soft">
        <span className="label-caps mr-2">Demo</span>
        Sem Supabase configurado. Os dados são de exemplo e ficam só nesta sessão.
      </p>
      <div className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface p-1">
        <Btn value="clinica" label="Clínica" />
        <Btn value="interno" label="Interno" />
        <Btn value="comercial" label="Comercial" />
      </div>
    </div>
  )
}
