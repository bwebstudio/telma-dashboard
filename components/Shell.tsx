'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { locales, type Locale } from '@/content'
import { setLocale, signOut } from '@/lib/actions/session'
import type { Panel } from '@/lib/access'
import type { ClinicAccent } from '@/lib/types'
import { IconSignOut, IconAccount } from './icons'
import { Logo } from './Logo'

export interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

export interface PanelLink {
  panel: Panel
  label: string
  href: string
}

// A mark next to the panel name, in a different tone per panel. Somebody who
// works in two of them all day recognises where they are before reading the
// word. It carries no meaning of its own, so no status colour is spent on it.
const PANEL_DOT: Record<Panel, string> = {
  clinica: 'bg-brand-accent',
  interno: 'bg-brand',
  crm: 'bg-ink',
}

function PanelName({ panel, label }: { panel: Panel; label: string }) {
  return (
    <span className="label-caps mt-1 flex min-w-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PANEL_DOT[panel]}`} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function Shell({
  nav,
  panel,
  panelLabel,
  panels = [],
  switchLabel,
  locale,
  userLabel,
  langLabel,
  signOutLabel,
  accountHref,
  accent,
  brandMark,
  banner,
  aside,
  children,
}: {
  nav: NavItem[]
  panel: Panel
  panelLabel: string
  /** Every panel this user may open. Rendered only when there is more than one. */
  panels?: PanelLink[]
  switchLabel?: string
  locale: Locale
  userLabel: string
  langLabel: string
  signOutLabel: string
  accountHref?: string
  /**
   * The clinic's chosen accent. It swaps the whole brand ramp underneath this
   * subtree (see [data-accent] in globals.css), so a clinic's panel is its own
   * colour without any component having to know about it.
   */
  accent?: ClinicAccent
  /** The clinic's logo, standing in for the Telma wordmark in its own panel. */
  brandMark?: ReactNode
  banner?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  // Cycles through every registered language, so adding one needs no change
  // here either.
  const other: Locale = locales[(locales.indexOf(locale) + 1) % locales.length]
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const showSwitcher = panels.length > 1

  const switcher = (compact?: boolean) => (
    <nav
      aria-label={switchLabel}
      // On a wide phone or a tablet the pills would otherwise stretch across
      // the whole width and stop reading as one control.
      className={`flex w-full items-center gap-1 rounded-pill border border-line-strong bg-surface p-1 ${
        compact ? 'sm:max-w-md' : ''
      }`}
    >
      {panels.map((p) => {
        const current = p.panel === panel
        return (
          <Link
            key={p.panel}
            href={p.href}
            aria-current={current ? 'page' : undefined}
            className={`min-w-0 flex-1 truncate rounded-pill px-3 py-1.5 text-center text-sm font-medium transition-colors ${
              current
                ? 'bg-ink text-white'
                : 'text-ink-soft hover:bg-brand-wash hover:text-ink'
            }`}
          >
            {p.label}
          </Link>
        )
      })}
    </nav>
  )

  const mark = brandMark ?? <Logo height={34} />
  const markSmall = brandMark ?? <Logo height={30} />

  return (
    <div
      className="min-h-screen lg:flex"
      data-accent={accent && accent !== 'brand' ? accent : undefined}
    >
      {/* Sidebar. Desktop only: on a tablet in portrait a 16rem rail eats a
          third of the width for four links that fit in the bottom bar. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface-sunken lg:flex">
        <div className="flex h-16 items-center gap-2 px-6">
          {mark}
          <PanelName panel={panel} label={panelLabel} />
        </div>
        {showSwitcher && <div className="px-3 pb-3">{switcher()}</div>}
        <nav className="flex-1 px-3 py-4" aria-label={panelLabel}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors ${
                isActive(item.href)
                  ? 'bg-ink text-white'
                  : 'text-ink-soft hover:bg-brand-wash hover:text-ink'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          {aside}
        </nav>
        <div className="border-t border-line px-4 py-4">
          {accountHref ? (
            <Link
              href={accountHref}
              aria-current={isActive(accountHref) ? 'page' : undefined}
              className="mb-3 flex items-center gap-2 truncate text-sm text-ink-soft hover:text-brand-accent"
            >
              <IconAccount className="h-4 w-4 shrink-0" />
              <span className="truncate">{userLabel}</span>
            </Link>
          ) : (
            <p className="mb-3 truncate text-sm text-ink-mute">{userLabel}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <form action={setLocale}>
              <input type="hidden" name="locale" value={other} />
              <input type="hidden" name="next" value={pathname} />
              <button
                type="submit"
                className="rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
                aria-label={langLabel}
              >
                {locale.toUpperCase()} · {other.toUpperCase()}
              </button>
            </form>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-brand-accent"
              >
                <IconSignOut className="h-4 w-4" />
                {signOutLabel}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: phone and tablet */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              {markSmall}
              {/* With a switcher right underneath, repeating the panel name up
                  here only costs the space it truncates in. */}
              {!showSwitcher && <PanelName panel={panel} label={panelLabel} />}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {accountHref && (
                <Link
                  href={accountHref}
                  aria-current={isActive(accountHref) ? 'page' : undefined}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft"
                  aria-label={userLabel}
                >
                  <IconAccount className="h-5 w-5" />
                </Link>
              )}
              <form action={setLocale}>
                <input type="hidden" name="locale" value={other} />
                <input type="hidden" name="next" value={pathname} />
                <button
                  type="submit"
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm text-ink-soft"
                  aria-label={langLabel}
                >
                  {other.toUpperCase()}
                </button>
              </form>
              <form action={signOut}>
                <button
                  type="submit"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft"
                  aria-label={signOutLabel}
                >
                  <IconSignOut className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
          {showSwitcher && <div className="px-4 pb-3 sm:px-6">{switcher(true)}</div>}
        </header>

        {banner}

        <main className="mx-auto w-full max-w-app flex-1 px-4 py-4 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:py-10 lg:pb-10">
          {children}
        </main>

        {/* Bottom tab bar: phone and tablet. Scrolls sideways rather than
            squeezing five labels into 375px. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label={panelLabel}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex min-h-[3.5rem] min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                isActive(item.href) ? 'text-brand-accent' : 'text-ink-mute'
              }`}
            >
              {item.icon}
              <span className="truncate px-1">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
