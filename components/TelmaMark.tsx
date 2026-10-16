/**
 * THE MARK.
 *
 * Three bars, left-flush, each one roughly 1.85 times the next: the paragraph
 * the brand is made of, reduced to the three lines that still read at sixteen
 * pixels. Same geometry as web/components/ui/TelmaMark — the numbers are the
 * logotype, so they are copied rather than approximated, and a change to one
 * is a change to both.
 *
 * `fill="currentColor"`, so the ground decides the colour: white on the
 * panel's near-black, ink on macaw out on the site.
 */
const U = 100
const GAP = 62
export const MARK_WIDTHS = [556, 294, 162]
const VW = MARK_WIDTHS[0]
const VH = U * 3 + GAP * 2

export function TelmaMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className={className} fill="currentColor" aria-hidden>
      {MARK_WIDTHS.map((w, i) => (
        <rect key={i} x={0} y={i * (U + GAP)} width={w} height={U} rx={U / 2} />
      ))}
    </svg>
  )
}
