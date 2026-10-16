'use client'

import { useEffect, useRef } from 'react'
import { GLYPH_BAG } from '@/lib/paragraph'
import { MARK_WIDTHS } from '@/components/TelmaMark'

/**
 * THE MARK, DRAWN OUT OF ITS OWN LETTERS.
 *
 * Ported from the site, where it carries the macaw band. Here it is the whole
 * of the dark half of the sign-in screen. Same file, deliberately: the gesture
 * is the brand's and a second implementation of it would drift. It is the
 * third thing now duplicated across the two repositories, after the mark and
 * the typeface, and the three of them are the argument for a shared package
 * the next time one of them has to change.
 *
 * The three bars, filled with characters packed tight enough to read as a
 * dark mass and loose enough that you can see what the mass is made of. Not
 * flat black: the ground shows through the gaps, so the shape comes out just
 * short of solid and the texture is the argument — a line in an agenda is
 * what is left of a great many words.
 *
 * ── IT WAS AN ANIMATION AND IT IS NOT ANY MORE ─────────────────────────────
 * The sequence assembled the mark out of a drifting cloud, and it never quite
 * read: the moment of formation went past too fast to follow and too slow to
 * ignore, and at the density the cloud needed to match the hero the characters
 * were two pixels, so what you watched was grain becoming a shape rather than
 * words becoming a line. The still version says the same thing in one frame
 * and asks nothing of the reader.
 *
 * The motion is still here behind `animate`, off by default, because the idea
 * is right and only the execution failed. Whoever picks it up should know the
 * real problem: the paragraph has to be legible as text at the size the band
 * allows, and that caps the character count far below the hero's.
 *
 * ── TWO DENSITIES, AND THEY ARE NOT INTERCHANGEABLE ────────────────────────
 * Still, the glyphs have to be glyphs: a few hundred at six pixels, where you
 * can see they are letters. Moving, the cloud has to be a cloud: a couple of
 * thousand, where each one is a speck. Using one count for both is what made
 * the still mark look like noise and the moving cloud look like confetti.
 *
 * ── THE CURSOR IS WHAT MAKES THE LETTERS LEGIBLE ───────────────────────────
 * Knocked out at a fixed strength the texture is honest but quiet: you have to
 * be told it is made of letters before you see it. So the pointer carries a
 * soft halo that opens the characters under it almost to the ground colour,
 * and a click sends a ring out through the bars. Both are the hero's own
 * gestures, the same Gaussian and the same travelling wave, because the field
 * at the top of the page and the mark down here are one object and should
 * answer to a hand the same way.
 *
 * Not on a coarse pointer. There is nothing to hover with on a phone, and a
 * halo left wherever a thumb last touched is worse than none. The test is
 * written as "unless coarse" rather than "if hover and fine", because the
 * positive form silently excludes every browser that declines to declare the
 * capability, which is how it came to do nothing at all in a headless check.
 */

const U = 100
const GAP = 62
const WIDTHS = MARK_WIDTHS
const VW = WIDTHS[0]
const VH = U * 3 + GAP * 2

/** Still: few enough that a character is a character. */
const STILL = 260
/** Moving: enough that the drift reads as a cloud. */
const FLOW = 1500

const PX = 1.55
const PY = 2

/** How much of the mass a character takes out of itself at rest, and under
 *  the cursor. The first number is the texture; the second is reading it. */
const KNOCK = 0.46
const KNOCK_LIT = 0.96
/** The halo, as a multiple of the mark's height. */
const HALO = 0.85
/** The ring from a click: how fast it travels and how long it lives. */
const RING_SPEED = 1.15
const RING_LIFE = 4200

/** The lane Band.tsx leaves clear for the mark. On wide screens it is down
 *  the left (lg:pl-[17rem]) and the mark centres in the band's height; on a
 *  phone that lane does not exist — the headline starts at px-8 — and the room
 *  is at the top instead (pt-28 = 7rem). Centring vertically there laid the
 *  mark straight over the first two lines of the headline. Keyed to the same
 *  1024px Tailwind uses for lg, so the canvas and the padding switch together. */
const LANE_TOP = 160

const CYCLE = 15000
const T = { cloud: 0.1, gather: 0.26, paragraph: 0.4, contract: 0.52, mark: 0.7, release: 0.8, scatter: 0.94 }

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3))
const span = (u: number, a: number, b: number) => ease((u - a) / (b - a))

function rnd(i: number, salt: number) {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Grain = { ch: number; x: number; y: number; w: number; h: number; fx: number; fy: number }

/** Slots that tile the three bars, as square as the count allows. */
function grains(count: number, alphabet: number) {
  const area = WIDTHS.reduce((a, w) => a + w * U, 0)
  const slot = Math.sqrt(area / count)
  const rows = Math.max(1, Math.round(U / slot))
  const out: Grain[] = []
  let i = 0
  WIDTHS.forEach((bw, bar) => {
    const cols = Math.max(2, Math.round(bw / slot))
    const w = bw / cols
    const h = U / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          ch: Math.floor(rnd(i, 5) * alphabet),
          x: c * w,
          y: bar * (U + GAP) + r * h,
          w,
          h,
          fx: rnd(i, 1),
          fy: rnd(i, 2),
        })
        i++
      }
    }
  })
  return { field: out, rows }
}

export function TelmaSettle({
  className = '',
  animate = false,
}: {
  className?: string
  /** Run the assembling sequence instead of the still mark. See the note above
   *  before turning this on. */
  animate?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const host = cv?.parentElement
    if (!cv || !host) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const still =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const chars = Array.from(new Set(GLYPH_BAG))
    const { field, rows } = grains(still ? STILL : FLOW, chars.length)

    // One sprite per character, drawn once and reused: a few hundred
    // drawImage calls cost nothing next to the same number of fillText.
    const CELL = 36
    const atlas = document.createElement('canvas')
    const ax = atlas.getContext('2d')!
    atlas.width = CELL * chars.length
    atlas.height = CELL

    let dpr = 1
    let w = 0
    let h = 0

    const fine = !window.matchMedia('(pointer: coarse)').matches
    // Held as the list, not as a boolean: the band is redrawn on resize and
    // rotation, and `.matches` has to be current at that moment.
    const wide = window.matchMedia('(min-width: 1024px)')
    const ptr = { x: 0, y: 0, at: 0, to: 0 }
    let rings: { x: number; y: number; born: number }[] = []

    const paint = () => {
      const colour = getComputedStyle(cv).color || '#111'
      ax.clearRect(0, 0, atlas.width, atlas.height)
      ax.fillStyle = colour
      const mono = getComputedStyle(cv).getPropertyValue('--font-mono').trim()
      ax.font = `${CELL * 0.76}px ${mono || 'ui-monospace'}, ui-monospace, monospace`
      ax.textAlign = 'center'
      ax.textBaseline = 'middle'
      chars.forEach((ch, i) => ax.fillText(ch, i * CELL + CELL / 2, CELL * 0.54))
      ctx.fillStyle = colour
    }

    const draw = (u: number, now = performance.now()) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Height drives the mark on a wide band and width on a narrow one, with
      // a floor so it does not shrink to a crumb on a phone.
      // On a wide band the mark takes its size from the band's height. In the
      // lane at the top it takes it from the lane, or it outgrows it around a
      // tablet and leans back over the first line of the headline.
      //
      // The phone number is not the desktop one scaled: the desktop rule is a
      // share of the band's width, and a phone band is narrow enough that the
      // share came out at 46px and the 76px floor was doing all the work. At
      // that size three rounded bars read as three things scribbled out, not
      // as a mark, which is the opposite of what this band is for. A third of
      // the width gets it back to roughly half the band's height, which is the
      // proportion the band was designed around.
      const markH = wide.matches
        ? Math.min(h * 0.44, Math.max(w * 0.135, 76))
        : Math.min(LANE_TOP - 28, Math.max(w * 0.33, 96))
      const k = markH / VH
      const ox = Math.max(w * 0.035, 14)
      const oy = wide.matches
        ? (h - markH) / 2
        : Math.max((LANE_TOP - markH) / 2, 12)
      const cx = ox + (VW * k) / 2
      const cy = oy + markH / 2

      const settle = span(u, T.cloud, T.gather) - span(u, T.release, T.scatter)
      const shrink = span(u, T.paragraph, T.contract) - span(u, T.mark, T.release)
      const sx = PX + (1 - PX) * shrink
      const sy = PY + (1 - PY) * shrink
      const pcx = Math.max(cx, (VW * k * PX) / 2 + 20)
      const ccx = pcx + (cx - pcx) * shrink
      const glyph = (U / rows) * k * sy * 1.15

      // Still, the bars are laid down just short of solid and the letters are
      // then punched out of them.
      //
      // Drawing the characters as the fill was the obvious way and it does not
      // work: a mono glyph's ink covers less than half the square it is drawn
      // in, so however tightly they are packed the bar comes out as a grey
      // mesh rather than a mark. Knocked out, the mass carries the shape and
      // the letters are what the mass is visibly made of.
      if (still) {
        ctx.save()
        ctx.clip(barsPath(k, ox, oy))
        ctx.globalAlpha = 0.94
        WIDTHS.forEach((bw, i) =>
          ctx.fillRect(ox, oy + i * (U + GAP) * k, bw * k, U * k),
        )
        ctx.globalCompositeOperation = 'destination-out'
      }

      const halo = markH * HALO
      const live = rings.filter((r) => now - r.born < RING_LIFE)
      rings = live

      for (const g of field) {
        const px = ccx + (g.x + g.w / 2 - VW / 2) * k * sx
        const py = cy + (g.y + g.h / 2 - VH / 2) * k * sy
        const x = still ? px : g.fx * w + (px - g.fx * w) * settle
        const y = still ? py : g.fy * h + (py - g.fy * h) * settle

        if (!still) {
          ctx.globalAlpha = 0.5 + 0.5 * settle
          ctx.drawImage(atlas, g.ch * CELL, 0, CELL, CELL, x - glyph / 2, y - glyph / 2, glyph, glyph)
          continue
        }

        // The cursor's halo, and any ring still travelling. Both only ever
        // add: at rest every character is at the same quiet strength.
        let lit = 0
        if (ptr.at > 0.001) {
          const dx = x - ptr.x
          const dy = y - ptr.y
          lit = Math.exp(-(dx * dx + dy * dy) / (halo * halo)) * ptr.at
        }
        for (const r of live) {
          const age = (now - r.born) / 1000
          const d = Math.hypot(x - r.x, y - r.y)
          // A band of brightness moving out, thickening and fading as it goes.
          const off = d - age * markH * RING_SPEED
          const width = markH * (0.16 + age * 0.05)
          lit += Math.exp(-(off * off) / (width * width)) * Math.exp(-age * 0.7)
        }
        lit = Math.min(1, lit)

        const a = KNOCK + (KNOCK_LIT - KNOCK) * lit
        const size = glyph * (1 + 0.22 * lit)
        ctx.globalAlpha = a
        ctx.drawImage(atlas, g.ch * CELL, 0, CELL, CELL, x - size / 2, y - size / 2, size, size)
      }

      if (still) ctx.restore()
    }


    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = host.getBoundingClientRect()
      w = r.width
      h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      cv.style.width = `${w}px`
      cv.style.height = `${h}px`
      if (still) draw(T.mark)
    }

    const barsPath = (k: number, ox: number, oy: number) => {
      const p = new Path2D()
      WIDTHS.forEach((bw, i) => p.roundRect(ox, oy + i * (U + GAP) * k, bw * k, U * k, (U * k) / 2))
      return p
    }


    let raf = 0
    let t0 = 0
    let visible = false

    const loop = (now: number) => {
      if (!still) {
        raf = requestAnimationFrame(loop)
        if (!visible) return
        if (!t0) t0 = now
        draw(((now - t0) % CYCLE) / CYCLE, now)
        return
      }

      // Still, the loop only runs while something is actually moving: the
      // halo easing in or out, or a ring still crossing. Otherwise the canvas
      // holds its last frame and costs nothing.
      ptr.at += (ptr.to - ptr.at) * 0.14
      const busy = Math.abs(ptr.to - ptr.at) > 0.002 || ptr.at > 0.002 || rings.length > 0
      draw(T.mark, now)
      raf = busy ? requestAnimationFrame(loop) : 0
    }

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }

    const at = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      ptr.x = e.clientX - r.left
      ptr.y = e.clientY - r.top
    }
    const onMove = (e: PointerEvent) => {
      at(e)
      ptr.to = 1
      wake()
    }
    const onLeave = () => {
      ptr.to = 0
      wake()
    }
    const onDown = (e: PointerEvent) => {
      at(e)
      rings.push({ x: ptr.x, y: ptr.y, born: performance.now() })
      if (rings.length > 4) rings.shift()
      wake()
    }

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.25 })
    const ro = new ResizeObserver(resize)

    resize()
    paint()
    ro.observe(host)

    if (still) {
      draw(T.mark)
      // Listened to on the band, not the canvas, so the headline and the
      // button do not punch holes in the field.
      if (fine) {
        host.addEventListener('pointermove', onMove)
        host.addEventListener('pointerleave', onLeave)
        host.addEventListener('pointerdown', onDown)
      }
    } else {
      io.observe(cv)
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
    }
  }, [animate])

  return <canvas ref={ref} aria-hidden className={className} />
}
