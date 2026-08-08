import { timingSafeEqual } from 'node:crypto'

// The door the voice agent comes through.
//
// Every route under /api that is not a browser route carries the same header,
// so the check lives in one place: a route added later cannot accidentally ship
// with a weaker version of it, and rotating the token is one grep.
//
// A missing TELMA_WEBHOOK_TOKEN denies everything. An environment that forgot
// the secret is not an environment that should be taking bookings.
export function authorizedWebhook(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  return safeEqual(request.headers.get('authorization') || '', `Bearer ${token}`)
}

// Compared byte by byte in constant time. `===` on a secret returns as soon as
// two bytes differ, and the time it takes to say no is enough to guess the
// token one character at a time.
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, so a wrong length has to be
  // answered here. Comparing the expected value against itself first keeps the
  // work the same either way, so the length does not leak through the clock.
  if (left.length !== right.length) {
    timingSafeEqual(right, right)
    return false
  }
  return timingSafeEqual(left, right)
}
