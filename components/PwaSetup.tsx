'use client'

import { useEffect } from 'react'

// Registers the service worker so the panel can be added to the home screen
// and behaves like an app. Nothing else depends on it: if registration fails
// (older browser, private mode) the app keeps working exactly as before.
export function PwaSetup() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
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
