/**
 * Where the time goes, when a screen takes longer than it should.
 *
 * Off unless TELMA_TRACE=1 is set, and then every outbound request the server
 * makes is logged with how long it took. Which is how the panel's two second
 * navigations were explained: not the queries, but two round trips to the
 * Supabase auth endpoint before any page could ask for a row of its own, plus
 * a price list being fetched from the database on every single load.
 *
 *   TELMA_TRACE=1 npm start     and read the log
 *
 * Nothing wraps anything when the variable is absent, which is every
 * deployment.
 */
export async function register() {
  if (process.env.TELMA_TRACE !== '1') return

  const original = globalThis.fetch
  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const started = Date.now()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    try {
      return await original(input, init)
    } finally {
      const ms = String(Date.now() - started).padStart(5)
      console.log(`[trace] ${ms}ms ${url.replace(/^https:\/\/[^/]+/, '').slice(0, 120)}`)
    }
  }
}
