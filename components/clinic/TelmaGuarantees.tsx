import type { Dictionary } from '@/content'
import { IconCheck } from '@/components/icons'

/**
 * The rules that are not the clinic's to change, said out loud.
 *
 * Every other block on this screen is a question the clinic answers, which is
 * the right shape for the things that are theirs: their hours, their services,
 * what she says about prices. Read on its own, a screen made only of those
 * says the clinic is responsible for how she behaves, and the first thing an
 * owner asks when shown it is what happens if she invents something.
 *
 * The answer already existed, in the prompt, versioned with the application and
 * visible on no screen at all. It is the stronger half of the argument: the
 * fields say she is yours, and this says there is a floor under her that you
 * cannot lower and neither can we by accident. Shown, and deliberately not
 * editable, because the moment it has a switch it stops being a guarantee.
 *
 * Kept in the dictionary rather than read from the prompt. The prompt is
 * written for a model, in the language of the clinic's own base, and rendering
 * it here would put two thousand words of instructions in front of somebody
 * deciding whether this product is too complicated for them.
 */
export function TelmaGuarantees({ dict }: { dict: Dictionary }) {
  const t = dict.telmaSettings

  return (
    <section className="rounded-card border border-line bg-surface-sunken p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{t.guaranteesTitle}</h2>
      <p className="mt-1 max-w-lead text-sm text-ink-soft">{t.guaranteesLead}</p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {t.guarantees.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-base text-ink-soft">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
