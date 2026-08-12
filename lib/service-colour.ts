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
 *  cryptographic hash: this only has to spread keys evenly over eight buckets. */
export function serviceColourIndex(key: string | null | undefined): number | null {
  if (!key) return null
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return (h % CATEGORY_COUNT) + 1
}

/**
 * What decides a booking's colour, and its label in the key.
 *
 * The service when the reason matched one, because that survives the caller
 * saying "the laser" one week and "laser hair removal" the next: both land on
 * the same colour, which is the entire point of colouring by service.
 *
 * When nothing matched, the reason itself, flattened. A clinic writes down what
 * people actually come in for, and half of it will never be in any catalogue;
 * giving all of that one grey would leave most weeks looking exactly as they
 * did before any of this, which is what happened on the first attempt.
 */
export function bookingCategory(
  serviceId: string | null,
  reason: string | null | undefined
): { key: string; index: number | null } | null {
  if (serviceId) return { key: serviceId, index: serviceColourIndex(serviceId) }
  const flat = (reason ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  return { key: flat, index: serviceColourIndex(flat) }
}

/** The CSS custom property holding that colour, or the neutral wash when the
 *  reason matched nothing the clinic offers. */
export function categoryBackground(index: number | null): string {
  return index ? `rgb(var(--cat-${index}))` : 'rgb(var(--surface-sunken))'
}
