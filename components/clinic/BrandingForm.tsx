'use client'

/* eslint-disable @next/next/no-img-element */
import { useActionState, useRef } from 'react'
import type { Dictionary } from '@/content'
import { uploadLogo, removeLogo, setTheme } from '@/lib/actions/branding'

/**
 * The whole of the clinic's personalisation: a logo and the lights.
 *
 * ── WHY THE ACCENT WENT ───────────────────────────────────────────────────
 * It asked a clinic to pick a hue for the washes behind a hovered row and a
 * selected day. A real choice, and not the one anybody was asking for: a
 * receptionist reading this screen a hundred times a day in a room with the
 * blinds down wants the lights off, not a different lilac. The accent is
 * still stored and the CSS still reads it, so nothing anybody chose was taken
 * away; it simply is not what this screen offers any more.
 *
 * Deliberately small, still. Every extra control here is a way for a clinic
 * to make its own panel harder to read, and the person who pays for that is
 * the receptionist trying to find a cancellation at eight in the morning.
 */
export function BrandingForm({
  logoUrl,
  clinicName,
  theme,
  dict,
}: {
  logoUrl: string | null
  clinicName: string
  theme: 'light' | 'dark'
  dict: Dictionary
}) {
  const t = dict.conta
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, action, pending] = useActionState(uploadLogo, null)

  const error =
    state?.error === 'size'
      ? t.logoTooBig
      : state?.error === 'type'
        ? t.logoBadType
        : state?.error
          ? dict.common.errorGeneric
          : null

  return (
    <div className="flex flex-col gap-8">
      {/* Logo ------------------------------------------------------------ */}
      <div>
        <p className="field-label">{t.logo}</p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-input border border-line bg-surface-sunken">
            {logoUrl ? (
              <img src={logoUrl} alt={clinicName} className="max-h-12 max-w-28 object-contain" />
            ) : (
              <span className="text-sm text-ink-mute">{t.logo}</span>
            )}
          </span>

          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
            >
              {pending ? t.logoSaving : t.logoChoose}
            </button>
          </form>

          {logoUrl && (
            <form action={removeLogo}>
              <button type="submit" className="btn-ghost">
                {t.logoRemove}
              </button>
            </form>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-mute">{t.logoHelp}</p>
        {error && (
          <p role="alert" className="mt-2 text-base font-medium text-danger">
            {error}
          </p>
        )}
      </div>

      {/* Light or dark ---------------------------------------------------- */}
      <div>
        <p className="field-label">{t.themeTitle}</p>
        <div role="radiogroup" aria-label={t.themeTitle} className="flex flex-wrap gap-2">
          {(['light', 'dark'] as const).map((value) => {
            const active = value === theme
            return (
              <form action={setTheme} key={value}>
                <input type="hidden" name="theme" value={value} />
                <button
                  type="submit"
                  role="radio"
                  aria-checked={active}
                  className={`inline-flex min-h-[2.75rem] items-center gap-2 rounded-pill border px-4 text-base transition-colors ${
                    active
                      ? 'border-ink bg-ink text-on-ink'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink/30 hover:text-ink'
                  }`}
                >
                  {/* The two grounds, shown as themselves rather than named
                      with a colour: the choice is about how the panel will
                      look, and this is what it will look like. */}
                  <span
                    aria-hidden
                    className="h-5 w-5 shrink-0 rounded-full border"
                    style={{
                      background: value === 'light' ? '#FFFFFF' : '#1A1A1A',
                      borderColor: value === 'light' ? '#D6D6D3' : '#4A4A4A',
                    }}
                  />
                  {t.themes[value]}
                </button>
              </form>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-ink-mute">{t.themeHelp}</p>
      </div>
    </div>
  )
}
