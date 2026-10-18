'use client'

import { useEffect } from 'react'

// Registers the service worker so the panel can be added to the home screen
// and behaves like an app. Nothing else depends on it: if registration fails
// (older browser, private mode) the app keeps working exactly as before.
//
// ── EXCEPT WHILE DEVELOPING, WHERE IT LIES ────────────────────────────────
// The worker serves cached pages. In production that is the point, because
// the files it caches keep their names between deployments. In development
// they do not: every restart of `next dev` renames the chunks, so a cached
// page comes back referencing scripts that no longer exist. The HTML renders,
// React never hydrates, and every button on the page is dead with nothing in
// the console and nothing in the server log, because the click never becomes
// a request. That cost an afternoon.
//
// So in development it does the opposite: it removes any worker already
// registered and empties its caches, which also repairs the browser of
// anybody who loaded the panel before this existed.
export function PwaSetup() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => (typeof caches !== 'undefined' ? caches.keys() : []))
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {
          // Nothing registered, or a browser that will not say. Either way
          // there is nothing to clean up.
        })
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not fatal. The offline queue lives in the page, not in the worker.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
