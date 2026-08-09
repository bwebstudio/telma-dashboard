import { copyFor } from '@/lib/onboarding/copy'
import { LOCALE_NAME, ONBOARDING_LOCALES, type OnboardingLocale } from '@/lib/onboarding/locale'

/**
 * The language switch, above everything it could change.
 *
 * It used to sit inside the form, under the title and the introduction. That is
 * one line too late: the person who needs it is the person who has just read a
 * heading in a language they do not speak, and by the time they find the switch
 * they have already decided this page is not for them.
 *
 * Links rather than buttons, so it survives being opened in a new tab, and a
 * full navigation rather than client state because the language is read on the
 * server. The step is not lost: the draft lives in localStorage and is restored
 * on the way back in.
 */
export function LocaleToggle({ locale }: { locale: OnboardingLocale }) {
  const t = copyFor(locale)
  return (
    <div className="flex items-center justify-between gap-3 sm:justify-end">
      <span className="text-sm text-ink-mute sm:sr-only">{t.languageLabel}</span>
      <div
        className="inline-flex rounded-pill border border-line bg-surface-sunken p-1"
        role="group"
        aria-label={t.languageLabel}
      >
        {ONBOARDING_LOCALES.map((l) => (
          <a
            key={l}
            href={`?lang=${l}`}
            aria-current={l === locale ? 'true' : undefined}
            className={[
              'rounded-pill px-4 py-1.5 text-sm transition-colors duration-fast ease-calm',
              l === locale
                ? 'bg-surface font-medium text-ink shadow-sm'
                : 'text-ink-mute hover:text-ink',
            ].join(' ')}
          >
            {LOCALE_NAME[l]}
          </a>
        ))}
      </div>
    </div>
  )
}
