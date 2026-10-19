import { updatePreAppointmentHoldConfig } from '@/lib/actions/clinic-settings'
import { HOLD_CHOICES, HOLD_MINUTES } from '@/lib/appointment-hold'
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
  holdMinutes,
  readOnly,
  dict,
}: {
  autoExpires: boolean
  /** The clinic's own window, one of HOLD_CHOICES. Thirty before 0065. */
  holdMinutes: number
  /** True while an administrator is visiting. A visit is never an edit. */
  readOnly: boolean
  dict: Dictionary
}) {
  const t = dict.conta
  // A number out of the database that is not on the list any more, because a
  // choice was retired, still has to read as itself on screen. The clinic is
  // waiting however long its row says, not however long the list says.
  const current = (HOLD_CHOICES as readonly number[]).includes(holdMinutes)
    ? holdMinutes
    : HOLD_MINUTES

  const options = [
    {
      value: true,
      title: t.holdAutoTitle.replace('{minutes}', String(current)),
      help: t.holdAutoHelp.replace('{minutes}', String(current)),
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
              <input type="hidden" name="hold_minutes" value={String(current)} />
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

      {/* ── HOW LONG, ONCE THERE IS A CLOCK ──────────────────────────────
          Only under the first option, because the second one has no clock
          to set. Minutes as chips rather than a select: five values, all
          of them worth reading at a glance, and nothing to open. */}
      {autoExpires && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="font-medium text-ink">{t.holdMinutesTitle}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{t.holdMinutesHelp}</p>

          <div
            role="radiogroup"
            aria-label={t.holdMinutesTitle}
            className="mt-3 flex flex-wrap gap-2"
          >
            {HOLD_CHOICES.map((minutes) => {
              const active = minutes === current
              // 240 min is a number somebody has to divide. 4 h is not.
              const label =
                minutes < 60
                  ? t.holdMinutesOption.replace('{minutes}', String(minutes))
                  : t.holdHoursOption.replace('{hours}', String(minutes / 60))
              const chip = `min-h-[2.75rem] rounded-full border px-4 text-base transition-colors duration-fast ease-calm ${
                active
                  ? 'border-brand-accent bg-brand-wash font-medium text-ink'
                  : 'border-line bg-surface text-ink-soft'
              }`

              if (readOnly) {
                return (
                  <span key={minutes} role="radio" aria-checked={active} className={`${chip} inline-flex items-center`}>
                    {label}
                  </span>
                )
              }

              return (
                <form action={updatePreAppointmentHoldConfig} key={minutes}>
                  <input type="hidden" name="auto_expires" value="true" />
                  <input type="hidden" name="hold_minutes" value={String(minutes)} />
                  <button type="submit" role="radio" aria-checked={active} className={`${chip} hover:border-ink/25`}>
                    {label}
                  </button>
                </form>
              )
            })}
          </div>
        </div>
      )}
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
