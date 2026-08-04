import { closeClinicPanel } from '@/lib/actions/view-clinic'

// Shown across the top of a client's panel while the administrator is inside
// it. Full width, above the content and on every screen size: the one thing
// that must never be missed is whose panel this is.
export function ViewingAsBar({
  clinicName,
  label,
  readOnlyLabel,
  exitLabel,
}: {
  clinicName: string
  label: string
  readOnlyLabel: string
  exitLabel: string
}) {
  return (
    <div className="border-b border-warn/30 bg-warn-soft">
      <div className="mx-auto flex w-full max-w-app flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <p className="min-w-0 text-sm text-ink">
          <span className="font-mid font-semibold">{label}</span>{' '}
          <span className="font-mid font-semibold">{clinicName}</span>
          <span className="text-ink-soft"> · {readOnlyLabel}</span>
        </p>
        <form action={closeClinicPanel}>
          <button
            type="submit"
            className="inline-flex min-h-[2.5rem] items-center rounded-pill border border-ink/20 px-4 text-sm font-medium text-ink hover:border-ink hover:bg-surface"
          >
            {exitLabel}
          </button>
        </form>
      </div>
    </div>
  )
}
