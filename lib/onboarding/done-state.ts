/**
 * The finished sign-up, kept for the length of a language change.
 *
 * The final screen is the only place the temporary password is ever shown, and
 * it lived only in React state. Changing language reloads the page (the switch
 * sets a cookie and redirects, so the whole shell agrees on the language), and
 * the reload put a clinic that already exists back on step 1 with the password
 * gone. Somebody who then filled the form in again met "this email already
 * exists" for an account whose password they had never written down.
 *
 * Kept in sessionStorage, not localStorage: one tab, gone when it closes, never
 * sent anywhere. And only for a while, because a password that outlives the
 * screen it was shown on is a password left lying around.
 *
 * No imports, so the regression test can load this file directly.
 */

export const DONE_STORAGE_KEY = 'telma_onboarding_done_v1'

/** Long enough to change language, reread and copy; short enough to expire. */
export const DONE_TTL_MS = 30 * 60 * 1000

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface Saved<R, V> {
  savedAt: number
  result: R
  values: V
}

export function saveDone<R, V>(storage: StorageLike, result: R, values: V, now = Date.now()): void {
  try {
    storage.setItem(DONE_STORAGE_KEY, JSON.stringify({ savedAt: now, result, values }))
  } catch {
    // Storage blocked or full: the screen still shows it, only a reload loses it.
  }
}

/** The finished sign-up, or null when there is none or it has expired. */
export function loadDone<R, V>(
  storage: StorageLike,
  now = Date.now()
): { result: R; values: V } | null {
  try {
    const raw = storage.getItem(DONE_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved<R, V>
    if (!saved?.result || typeof saved.savedAt !== 'number' || now - saved.savedAt > DONE_TTL_MS) {
      storage.removeItem(DONE_STORAGE_KEY)
      return null
    }
    return { result: saved.result, values: saved.values }
  } catch {
    return null
  }
}
