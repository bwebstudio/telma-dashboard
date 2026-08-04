'use client'

/* eslint-disable @next/next/no-img-element */
import { useActionState, useRef } from 'react'
import type { Dictionary } from '@/content'
import { CLINIC_ACCENTS, type ClinicAccent } from '@/lib/types'
import { uploadLogo, removeLogo, setAccent } from '@/lib/actions/branding'

// The swatch a clinic actually picks from. These are the same five ramps as
// [data-accent] in globals.css; showing the solid is enough to choose by, and
// keeps the control from turning into a colour picker.
const SWATCH: Record<ClinicAccent, string> = {
  brand: '#183C37',
  ocean: '#143454',
  plum: '#3D2242',
  clay: '#7A301A',
  slate: '#272D33',
}

/**
 * The whole of the clinic's personalisation: a logo and one accent.
 *
 * Deliberately small. Every extra control here is a way for a clinic to make
 * its own panel harder to read, and the person who pays for that is the
 * receptionist trying to find a cancellation at eight in the morning.
 */
export function BrandingForm({
  logoUrl,
  clinicName,
  accent,
  dict,
}: {
  logoUrl: string | null
  clinicName: string
  accent: ClinicAccent
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

      {/* Accent ---------------------------------------------------------- */}
      <div>
        <p className="field-label">{t.accentTitle}</p>
        <div className="flex flex-wrap gap-2">
          {CLINIC_ACCENTS.map((value) => {
            const active = value === accent
            return (
              <form action={setAccent} key={value}>
                <input type="hidden" name="accent" value={value} />
                <button
                  type="submit"
                  aria-pressed={active}
                  className={`inline-flex min-h-[2.75rem] items-center gap-2 rounded-pill border px-3 text-base transition-colors ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink/30 hover:text-ink'
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border border-black/10"
                    style={{ background: SWATCH[value] }}
                    aria-hidden
                  />
                  {t.accents[value]}
                </button>
              </form>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-ink-mute">{t.accentHelp}</p>
      </div>
    </div>
  )
}
