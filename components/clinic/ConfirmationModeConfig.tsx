import { updateConfirmationMode } from '@/lib/actions/clinic-settings'
import type { Dictionary } from '@/content'

/**
 * Who says a booking is real.
 *
 * The product was built on one answer: Telma takes it, a person says yes. The
 * first two clinics asked for the opposite and their reason was the one that
 * made them buy Telma -- if somebody has to confirm every booking by hand the
 * telephone has been answered for them but the work has not been taken away.
 *
 * Both answers are right for somebody, so it is a choice and it is written as
 * two sentences about what the patient hears rather than as a switch labelled
 * "automatic confirmation", which says nothing about the thing that matters.
 *
 * The second sentence of the manual option is the one that earns its place.
 * "The patient hears nothing until somebody confirms it here" is true today,
 * invisible today, and is exactly what those two clinics did not know they
 * were choosing.
 *
 * ── WHY ONE OPTION CAN BE UNPRESSABLE ──────────────────────────────────────
 * Switching to automatic strands whatever is already pending: Telma confirms
 * what she takes from then on, not what is already waiting, so those bookings
 * would sit there holding hours until somebody noticed. The alternative was to
 * confirm them on the way through, which sends a burst of real SMS as a side
 * effect of changing a preference. So the clinic answers them first. The rule
 * is in the action as well: this is the courtesy, that is the gate.
 */
export function ConfirmationModeConfig({
  autoConfirm,
  pendingCount,
  readOnly,
  dict,
}: {
  autoConfirm: boolean
  /** Bookings still waiting for somebody. Blocks the switch while above zero. */
  pendingCount: number
  /** True while an administrator is visiting. A visit is never an edit. */
  readOnly: boolean
  dict: Dictionary
}) {
  const t = dict.conta
  const blocked = pendingCount > 0

  const options = [
    { value: true, title: t.modeAutoTitle, help: t.modeAutoHelp },
    { value: false, title: t.modeManualTitle, help: t.modeManualHelp },
  ]

  return (
    <div>
      <p className="mb-4 text-base text-ink-soft">{t.modeHelp}</p>

      <div role="radiogroup" aria-label={t.modeTitle} className="flex flex-col gap-3">
        {options.map((option) => {
          const active = option.value === autoConfirm
          // Only the automatic one, and only on the way in: nothing is
          // stranded by going back to a person deciding.
          const unavailable = option.value && blocked && !active

          const body = (
            <span className="block">
              <span className="block font-medium text-ink">{option.title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">{option.help}</span>
              {unavailable && (
                <span className="mt-2 block text-sm font-medium text-ink-mute">
                  {t.modeBlocked.replace('{n}', String(pendingCount))}
                </span>
              )}
            </span>
          )

          const shell = `flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors duration-fast ease-calm ${
            active ? 'border-brand-accent bg-brand-wash' : 'border-line bg-surface'
          }`

          if (readOnly || unavailable) {
            return (
              <div
                key={String(option.value)}
                role="radio"
                aria-checked={active}
                aria-disabled={unavailable || undefined}
                className={`${shell} ${unavailable ? 'opacity-60' : ''}`}
              >
                <Dot active={active} />
                {body}
              </div>
            )
          }

          return (
            <form action={updateConfirmationMode} key={String(option.value)}>
              <input type="hidden" name="auto_confirm" value={String(option.value)} />
              <button
                type="submit"
                role="radio"
                aria-checked={active}
                className={`${shell} min-h-[2.75rem] hover:border-ink/25`}
              >
                <Dot active={active} />
                {body}
              </button>
            </form>
          )
        })}
      </div>
    </div>
  )
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        active ? 'border-brand-accent' : 'border-line-strong'
      }`}
    >
      {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-accent" />}
    </span>
  )
}
