'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A dialog, kept to what a dialog owes the person using it.
 *
 * Escape closes it, the backdrop closes it, focus moves inside on open and
 * returns to whatever opened it on close, and Tab cannot walk out of it into
 * the page underneath. Those are not polish: a receptionist who opened this by
 * mistake, mid-morning, with a patient on the line, needs one obvious way out.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    // The first field, not the panel: the clinic came here to type a number.
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    // The page behind must not scroll under the dialog on a phone.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes it, so
        // a drag that began inside the panel does not dismiss the form.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-card border border-line bg-surface p-6 shadow-3 sm:rounded-card"
      >
        {children}
      </div>
    </div>
  )
}
