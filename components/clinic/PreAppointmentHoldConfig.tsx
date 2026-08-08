import { updatePreAppointmentHoldConfig } from '@/lib/actions/clinic-settings'
import { HOLD_MINUTES } from '@/lib/appointment-hold'
import type { Dictionary } from '@/content'

/**
 * What happens to a pre-marcação nobody has answered yet.
 *
 * A real choice with a real cost either way, so it is written as two sentences
 * about the clinic's day rather than as a switch labelled "auto-expire". A
 * clinic with somebody at the desk wants the hour back; a practice that reads
 * the panel between patients would find bookings lapsing at eight in the
 * evening and a patient turning up to an appointment that no longer exists.
 *
 * Each option is its own form, the way the accent picker on this same screen
 * works: pressing one applies it, with no save button to forget and no
 * JavaScript required to make the choice stick.
 */
export function PreAppointmentHoldConfig({
  autoExpires,
  readOnly,
  dict,
}: {
  autoExpires: boolean
  /** True while an administrator is visiting. A visit is never an edit. */
  readOnly: boolean
  dict: Dictionary
}) {
  const t = dict.conta

  const options = [
    {
      value: true,
      title: t.holdAutoTitle.replace('{minutes}', String(HOLD_MINUTES)),
      help: t.holdAutoHelp.replace('{minutes}', String(HOLD_MINUTES)),
    },
    { value: false, title: t.holdManualTitle, help: t.holdManualHelp },
  ]

  return (
    <div>
      <p className="mb-4 text-base text-ink-soft">{t.holdHelp}</p>

      <div role="radiogroup" aria-label={t.holdTitle} className="flex flex-col gap-3">
        {options.map((option) => {
          const active = option.value === autoExpires

          const body = (
            <span className="block">
              <span className="block font-medium text-ink">{option.title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">{option.help}</span>
            </span>
          )

          const shell = `flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors duration-fast ease-calm ${
            active ? 'border-brand-accent bg-brand-wash' : 'border-line bg-surface'
          }`

          // Read only: the same two cards, without anything to press. A
          // disabled button that looks pressable is a promise the panel is not
          // going to keep for a visitor.
          if (readOnly) {
            return (
              <div key={String(option.value)} role="radio" aria-checked={active} className={shell}>
                <Dot active={active} />
                {body}
              </div>
            )
          }

          return (
            <form action={updatePreAppointmentHoldConfig} key={String(option.value)}>
              <input type="hidden" name="auto_expires" value={String(option.value)} />
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
