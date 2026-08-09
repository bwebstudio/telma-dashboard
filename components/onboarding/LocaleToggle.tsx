import { setLocale } from '@/lib/actions/session'
import { copyFor } from '@/lib/onboarding/copy'
import { LOCALE_NAME, ONBOARDING_LOCALES, type OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * The language switch, above everything it could change.
 *
 * It used to sit inside the form, under the title. That is one line too late:
 * the person who needs it has just read a heading in a language they do not
 * speak, and by the time they scroll to a switch further down they have decided
 * this page is not for them.
 *
 * ── WHY THIS IS A FORM AND NOT TWO LINKS ────────────────────────────────────
 * It was two links to `?lang=`, which the page reads and the layout cannot: a
 * layout gets no search params. So the heading changed language and the header
 * above it did not, and "Ya tengo cuenta" sat over a Portuguese page. Worse than
 * a one-navigation lag, which is what the code claimed: `?lang=` never wrote the
 * cookie, so the header stayed wrong for good.
 *
 * Setting the cookie is what makes every part of the page agree, because that is
 * the one thing both the layout and the page read. The cost is that this can no
 * longer be opened in a new tab, which nobody does to a language switch.
 */
export function LocaleToggle({
  locale,
  next = '/inscricao',
}: {
  locale: OnboardingLocale
  /** Where to come back to, query string and all, so a plan chosen on the
   *  landing is not lost by changing language. */
  next?: string
}) {
  const t = copyFor(locale)
  return (
    <form
      action={setLocale}
      className="flex items-center justify-between gap-3 sm:justify-end"
    >
      <input type="hidden" name="next" value={next} />
      <span className="text-sm text-ink-mute sm:sr-only">{t.languageLabel}</span>
      <div
        className="inline-flex rounded-pill border border-line bg-surface-sunken p-1"
        role="group"
        aria-label={t.languageLabel}
      >
        {ONBOARDING_LOCALES.map((l) => (
          <button
            key={l}
            type="submit"
            name="locale"
            value={l}
            aria-current={l === locale ? 'true' : undefined}
            className={[
              'rounded-pill px-4 py-1.5 text-sm transition-colors duration-fast ease-calm',
              l === locale
                ? 'bg-surface font-medium text-ink shadow-sm'
                : 'text-ink-mute hover:text-ink',
            ].join(' ')}
          >
            {LOCALE_NAME[l]}
          </button>
        ))}
      </div>
    </form>
  )
}
