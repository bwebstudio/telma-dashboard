/**
 * A colour per service, so a week reads at a glance.
 *
 * Derived from the service rather than stored, and derived by hashing the id
 * rather than by its position in the clinic's list. Position looked simpler and
 * is wrong in a way nobody would report: unticking one service shifts the
 * colour of every service after it, so a clinic that learned "the orange ones
 * are laser" finds out otherwise on a Monday morning, with no change they can
 * point at.
 *
 * Eight is enough. Beyond that colours repeat, which is honest: past eight
 * categories nobody is telling them apart by colour anyway, and every chip
 * carries the hour and the name in text regardless.
 */

export const CATEGORY_COUNT = 8

/** Stable across deploys, machines and languages. Deliberately not a
 *  cryptographic hash: this only has to spread ids evenly over eight buckets. */
export function serviceColourIndex(serviceId: string | null | undefined): number | null {
  if (!serviceId) return null
  let h = 0
  for (let i = 0; i < serviceId.length; i++) h = (h * 31 + serviceId.charCodeAt(i)) >>> 0
  return (h % CATEGORY_COUNT) + 1
}

/** The CSS custom property holding that colour, or the neutral wash when the
 *  reason matched nothing the clinic offers. */
export function categoryBackground(index: number | null): string {
  return index ? `rgb(var(--cat-${index}))` : 'rgb(var(--surface-sunken))'
}
