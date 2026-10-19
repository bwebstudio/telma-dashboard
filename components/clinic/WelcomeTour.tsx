'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Dictionary } from '@/content'
import { TelmaMark } from '@/components/TelmaMark'
import { markWelcomed } from '@/lib/actions/welcome'

/**
 * The first minute in the panel: a welcome, then a walk round the room.
 *
 * ── WHY IT IS NOT JUST A MODAL ────────────────────────────────────────────
 * A clinic arriving here has bought a receptionist and been shown a sidebar
 * with six words on it, two of which (Agenda, Citas, Horários) sound like the
 * same drawer. The names were already rewritten once for that reason. A tour
 * costs one minute and answers the question the names cannot: which of these
 * do I open every morning, and which do I set once.
 *
 * ── WHY IT IS MEASURED AND NOT DRAWN ──────────────────────────────────────
 * Each step finds its target by `data-tour` and measures it. Nothing is
 * positioned by hand, so a sidebar item that moves does not leave a spotlight
 * pointing at empty space -- a step whose target is missing is skipped
 * instead, which is the behaviour that survives the next redesign.
 *
 * ── WHY IT CAN ALWAYS BE LEFT ─────────────────────────────────────────────
 * Escape closes it, the backdrop is not a trap, and every step has the exit
 * in the same place. A tour somebody cannot get out of is a worse first
 * minute than no tour. Leaving counts as having seen it: being shown it again
 * tomorrow is the product arguing with them.
 */

// The five places in the sidebar, each with a `data-tour` attribute to point
// at, and then one stop that is not a place at all.
const NAV_IDS = ['hoje', 'marcacoes', 'conversas', 'horarios', 'telma'] as const

/**
 * The last card: change the password you were emailed.
 *
 * It has nothing to highlight, which is why it is kept apart from the five
 * above rather than added to them: `measure` finds no element, the bubble
 * falls back to its own position, and the card carries a link instead of a
 * "next". The moment is chosen rather than convenient -- the first minute in
 * the panel is the one time somebody is certainly looking, and the password
 * they are using arrived in an email and is still sitting in that inbox.
 */
const PASSWORD_STEP = 'password' as const

/** Where it is actually changed. Not described in the copy: the button goes
 *  there, so nobody has to remember a path. */
const PASSWORD_URL = '/nova-palavra-passe'

/**
 * Which element each stop points at.
 *
 * The five rooms point at their own sidebar entry. The password points at the
 * account, one line below them, because that is where it is changed from
 * tomorrow onwards: the button on the card is for right now, and the ring
 * around the account is for the next time they look.
 */
const ANCHOR: Record<StepId, string> = {
  hoje: 'hoje',
  marcacoes: 'marcacoes',
  conversas: 'conversas',
  horarios: 'horarios',
  telma: 'telma',
  password: 'conta',
}

type StepId = (typeof NAV_IDS)[number] | typeof PASSWORD_STEP

interface Box {
  top: number
  left: number
  width: number
  height: number
}

export function WelcomeTour({ dict, clinicName }: { dict: Dictionary; clinicName: string }) {
  const t = dict.welcome
  // -1 is the welcome card; 0 and up are the steps.
  const [at, setAt] = useState(-1)
  const [open, setOpen] = useState(true)
  const [box, setBox] = useState<Box | null>(null)
  const [mounted, setMounted] = useState(false)
  const [steps, setSteps] = useState<StepId[]>([])
  const saved = useRef(false)

  // Worked out once, after mount, and kept. Recomputing it inside the render
  // made a new array every pass, and that array is a dependency of the effect
  // that measures: the effect re-subscribed on every render for ever.
  //
  // Only the steps that have somewhere to point. At phone width the sidebar
  // is not on screen, and a tour of five invisible targets is five dark
  // screens.
  useEffect(() => {
    setMounted(true)
    setSteps([
      ...NAV_IDS.filter((id) => document.querySelector(`[data-tour="${id}"]`)),
      // Always. On a phone the sidebar is not on screen and the five stops
      // above drop out, which used to leave no tour at all; the password is
      // worth one card on its own.
      PASSWORD_STEP,
    ])
  }, [])

  /** Remembered once, whether they walked it or left on the first card. */
  const finish = useCallback(() => {
    setOpen(false)
    if (saved.current) return
    saved.current = true
    void markWelcomed()
  }, [])

  const measure = useCallback(() => {
    if (at < 0 || at >= steps.length) return setBox(null)
    const el = document.querySelector<HTMLElement>(`[data-tour="${ANCHOR[steps[at]]}"]`)
    if (!el) return setBox(null)
    const r = el.getBoundingClientRect()
    const pad = 6
    setBox({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    })
  }, [at, steps])

  useEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!mounted || !open) return null

  // No sidebar to point at, so the walk has nothing to show. The welcome card
  // still earns its place; the tour quietly is not offered.
  const walkable = steps.length > 0

  function next() {
    if (at + 1 >= steps.length) return finish()
    setAt(at + 1)
  }

  const overlay = (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={t.title}>
      {at < 0 ? (
        <>
          <button
            type="button"
            aria-label={t.skip}
            onClick={finish}
            className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-[2px]"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-hero bg-surface shadow-3">
              <div className="flex items-center gap-3 bg-ink px-7 py-5 text-white">
                <TelmaMark className="h-5 w-auto" />
                <span className="text-lg font-medium tracking-tight">Telma</span>
              </div>
              <div className="h-[3px] bg-accent" />
              <div className="p-7">
                <p className="label-caps text-ink-mute">{t.eyebrow}</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                  {t.title.replace('{clinic}', clinicName)}
                </h2>
                <p className="mt-3 max-w-prose text-lg leading-relaxed text-ink-soft">{t.lead}</p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  {walkable && (
                    <button type="button" onClick={() => setAt(0)} className="btn-primary">
                      {t.start}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={finish}
                    className={walkable ? 'btn-ghost' : 'btn-primary'}
                  >
                    {walkable ? t.skip : t.close}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* The hole. One element with an enormous shadow rather than four
              panels around the target: four panels leave hairlines between
              them at fractional device pixels, which reads as a rendering
              fault on the very first screen somebody sees. */}
          {box && (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-200 ease-calm"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                boxShadow: '0 0 0 9999px rgba(17,17,17,0.6)',
              }}
            />
          )}
          <button
            type="button"
            aria-label={t.skip}
            onClick={finish}
            className="absolute inset-0 cursor-default"
          />
          <Bubble box={box}>
            <p className="label-caps text-ink-mute">
              {t.step.replace('{n}', String(at + 1)).replace('{total}', String(steps.length))}
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-ink">{t.steps[steps[at]].title}</h3>
            <p className="mt-1.5 text-base leading-relaxed text-ink-soft">
              {t.steps[steps[at]].body}
            </p>
            <div className="mt-4 flex items-center gap-3">
              {steps[at] === PASSWORD_STEP ? (
                <>
                  {/* Marked welcomed before leaving, or the tour is waiting
                      again on the other side of changing the password. */}
                  <a
                    href={PASSWORD_URL}
                    onClick={finish}
                    className="btn-primary min-h-0 px-4 py-2 text-sm"
                  >
                    {t.changePassword}
                  </a>
                  <button
                    type="button"
                    onClick={finish}
                    className="btn-ghost min-h-0 px-2 py-2 text-sm"
                  >
                    {t.done}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={next}
                    className="btn-primary min-h-0 px-4 py-2 text-sm"
                  >
                    {t.next}
                  </button>
                  <button
                    type="button"
                    onClick={finish}
                    className="btn-ghost min-h-0 px-2 py-2 text-sm"
                  >
                    {t.skip}
                  </button>
                </>
              )}
            </div>
          </Bubble>
        </>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}

/**
 * The card that explains the thing being pointed at.
 *
 * Beside the target where there is room and below it where there is not, then
 * clamped inside the viewport. Clamping and not just flipping, because the
 * sidebar entries near the bottom of a short laptop screen have neither room
 * below nor room beside.
 */
function Bubble({ box, children }: { box: Box | null; children: React.ReactNode }) {
  const W = 320
  const GAP = 14
  if (!box) {
    return (
      <div className="absolute inset-x-4 bottom-6 mx-auto max-w-sm rounded-card bg-surface p-5 shadow-3">
        {children}
      </div>
    )
  }
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const rightRoom = vw - (box.left + box.width) > W + GAP * 2
  const left = rightRoom ? box.left + box.width + GAP : Math.max(16, Math.min(box.left, vw - W - 16))
  const top = rightRoom
    ? Math.max(16, Math.min(box.top, vh - 220))
    : Math.max(16, Math.min(box.top + box.height + GAP, vh - 220))
  return (
    <div
      className="absolute rounded-card bg-surface p-5 shadow-3"
      style={{ top, left, width: W }}
    >
      {children}
    </div>
  )
}
