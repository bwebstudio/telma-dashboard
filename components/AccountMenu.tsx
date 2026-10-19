'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconAccount } from '@/components/icons'

export interface AccountMenuItem {
  href: string
  label: string
}

/**
 * The clinic's name, at the foot of the sidebar, made to look like what it is.
 *
 * ── WHY IT STOPPED BEING A LINK ───────────────────────────────────────────
 * It was one, and it read as a label: a line with the clinic's name on it,
 * which is exactly what a sidebar footer usually is. Behind it sat the clinic
 * data, the plan, the invoices, the password and the subscription, and the
 * only way to find any of them was to try clicking your own name. Important
 * things should not depend on an accidental discovery.
 *
 * A chevron changes the reading of the whole line at almost no cost, and the
 * menu it opens names the three places instead of making them one long page
 * nobody scrolls to the bottom of.
 *
 * ── WHY IT IS NOT ANOTHER ENTRY IN THE SIDEBAR ────────────────────────────
 * Horários and Telma are how Telma works for this clinic, which is what the
 * sidebar is about. The plan, the password and the subscription are about the
 * account that pays for her. The separation was already right; what was
 * missing was any sign that the second one exists.
 */
export function AccountMenu({
  label,
  title,
  items,
  compact = false,
}: {
  /** The clinic's name. */
  label: string
  /** "Account settings", over the list. */
  title: string
  items: AccountMenuItem[]
  /** The phone header, where there is room for an icon and nothing else. */
  compact?: boolean
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Closed by anything that means "I am looking at something else now".
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const here = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The tour's last stop points here: the password is changed behind
        // this menu, and somebody who has just been told that should be able
        // to find it again without being given a path.
        data-tour="conta"
        aria-label={compact ? label : undefined}
        className={
          compact
            ? 'inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft'
            : 'flex w-full items-center gap-2 rounded-input px-1 py-1 text-sm text-ink-soft hover:text-ink'
        }
      >
        <IconAccount className={compact ? 'h-5 w-5' : 'h-4 w-4 shrink-0'} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <Chevron open={open} />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={title}
          // Upwards on the sidebar, downwards under the phone header: both
          // are the direction with room in them.
          className={`absolute z-40 w-64 overflow-hidden rounded-card border border-line-strong bg-surface shadow-3 ${
            compact ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2'
          }`}
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-medium text-ink">{label}</p>
            <p className="mt-0.5 text-sm text-ink-mute">{title}</p>
          </div>
          <ul className="py-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  aria-current={here(item.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2.5 text-base hover:bg-surface-sunken ${
                    here(item.href) ? 'font-medium text-ink' : 'text-ink-soft'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
