// Basic service worker for the Telma panel.
//
// Deliberately conservative. This is an authenticated app whose pages are all
// personal data, so nothing that comes back from a page request is ever
// cached: a stale HOJE showing yesterday's calls would be worse than no page
// at all. What is cached is the shell that makes the app feel installed —
// fonts, icons, the immutable build assets — plus a small offline notice for
// navigations that cannot be served.
//
// Writes do not depend on this file. Logged interactions are queued in
// localStorage by the app itself and retried when the connection returns.

// Bumped from v2 to drop caches poisoned by the development bug described in
// isCacheableAsset(). The activate handler deletes every cache that does not
// start with VERSION, so an already installed worker heals itself on next load
// instead of needing somebody to clear site data by hand.
const VERSION = 'telma-v3'
const STATIC_CACHE = `${VERSION}-static`

// Next serves development chunks under the same /_next/static/ prefix as the
// production ones, but rebuilds them in place under stable names. Serving those
// cache first hands the browser a client bundle from an earlier compile, and a
// client bundle from an earlier compile carries server action ids the running
// server has never heard of: every button then fails with "Failed to find
// Server Action", and a reload does not help because the worker answers before
// the network does.
//
// Production assets are content hashed and genuinely immutable, so the rule is
// not "never cache build output". It is "not while developing".
const IS_DEV =
  self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'

const PRECACHE = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

const OFFLINE_HTML = `<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem ligação</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#FCFCFA;color:#111827;font:400 17px/1.5 system-ui,sans-serif;padding:24px}
  div{max-width:22rem;text-align:center}
  h1{font-size:1.5rem;margin:0 0 .5rem}
  p{color:#4B5563;margin:0 0 1.5rem}
  button{min-height:3rem;padding:0 1.75rem;border:0;border-radius:999px;
         background:#183C37;color:#fff;font-size:1rem;font-weight:600}
</style></head>
<body><div>
  <h1>Sem ligação</h1>
  <p>As notas que gravou ficam guardadas no telemóvel e são enviadas quando houver rede.</p>
  <button onclick="location.reload()">Tentar de novo</button>
</div></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

function isCacheableAsset(url) {
  if (url.pathname.startsWith('/_next/static/')) return !IS_DEV
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.woff2')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Build output and fonts are immutable: serve from cache, fill it on miss.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
            }
            return res
          })
      )
    )
    return
  }

  // Pages: always the network, never a cached copy of somebody's data.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
      )
    )
  }
})
