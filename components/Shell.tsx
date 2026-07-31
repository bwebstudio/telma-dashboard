'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { locales, type Locale } from '@/content'
import { setLocale, signOut } from '@/lib/actions/session'
import { IconSignOut, IconAccount } from './icons'
import { Logo } from './Logo'

export interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

const VARIANT_LABEL: Record<string, string> = {
  clinica: 'Clínica',
  interno: 'Interno',
  crm: 'Comercial',
}

export function Shell({
  nav,
  variant,
  variantLabel,
  locale,
  userLabel,
  langLabel,
  signOutLabel,
  accountHref,
  aside,
  children,
}: {
  nav: NavItem[]
  variant: 'clinica' | 'interno' | 'crm'
  variantLabel?: string
  locale: Locale
  userLabel: string
  langLabel: string
  signOutLabel: string
  accountHref?: string
  aside?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  // Cycles through every registered language, so adding one needs no change
  // here either.
  const other: Locale = locales[(locales.indexOf(locale) + 1) % locales.length]
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface-sunken md:flex">
        <div className="flex h-16 items-center gap-2 px-6">
          <Logo height={26} />
          <span className="label-caps mt-1">
            {variantLabel ?? VARIANT_LABEL[variant]}
          </span>
        </div>
        <nav className="flex-1 px-3 py-4" aria-label={variant}>
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
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
          <Logo height={22} />
          <div className="flex items-center gap-1">
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
        </header>

        <main className="mx-auto w-full max-w-app flex-1 px-4 py-4 pb-28 sm:px-6 sm:py-6 md:px-8 md:py-10 md:pb-10">
          {children}
        </main>

        {/* Bottom tab bar (mobile) */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 backdrop-blur md:hidden"
          aria-label={variant}
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
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
