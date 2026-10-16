'use client'

import { useEffect, useRef } from 'react'

/**
 * A living sculpture of letters: a sheet of a few thousand characters, seen in
 * perspective, breathing slowly, brightening where the cursor passes and
 * rippling where it is clicked or tapped.
 *
 * It fills its positioned parent and listens for the pointer on that parent,
 * so copy laid over it does not block the hover. Mark the copy with
 * `data-field-copy` and the sheet thins out behind it.
 *
 * EXPERIMENT. Local only, not wired into production. See ./README.md.
 */
export function TelmaConversationField({
  className = '',
  centered = false,
}: {
  className?: string
  /** Centre the sculpture behind centred copy (the closing section). */
  centered?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const surface = canvas?.parentElement?.parentElement
    if (!canvas || !surface) return

    let dispose: (() => void) | undefined
    let cancelled = false

    // The atlas is drawn in the site's own typeface, so wait for it: drawn in
    // the fallback, every letter would be Arial for the life of the page.
    const family =
      getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() ||
      'system-ui, sans-serif'

    Promise.all([
      import('./engine'),
      document.fonts.load(`400 46px ${family}`, 'aeomrtãç?.,').catch(() => null),
    ]).then(([{ createField }]) => {
      if (cancelled) return
      try {
        const field = createField({
          canvas,
          surface,
          copy: () => surface.querySelector<HTMLElement>('[data-field-copy]'),
          fontFamily: family,
          centered,
        })
        // No field, no reserved space. createField returns null when the
        // browser has no WebGL2 — an older phone, Lockdown Mode, some in-app
        // browsers — and the phone layout holds a spacer the height of two
        // thirds of the screen for a sculpture that would never arrive. The
        // flag is what that spacer keys off; without it the hero is a
        // screenful of black nothing, which is worse than no sculpture.
        if (!field) return
        dispose = field.dispose
        canvas.style.opacity = '1'
        surface.dataset.fieldLive = 'true'
      } catch (error) {
        console.error('[TelmaConversationField]', error)
      }
    })

    return () => {
      cancelled = true
      dispose?.()
      delete surface.dataset.fieldLive
    }
  }, [centered])

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full opacity-0 transition-opacity duration-[1200ms] ease-calm"
      />
    </div>
  )
}
