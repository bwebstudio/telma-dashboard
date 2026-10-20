import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isDemo } from '@/lib/demo/config'
import { supabaseUrl, supabaseAnonKey, supabaseConfigError } from './env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Reachable without a session. `/inscricao` is where a clinic signs itself up,
// so requiring a session there would require an account to create an account.
// `/api/onboarding` is the same flow's HTTP surface, and it authenticates
// nothing: it validates every payload instead, in lib/onboarding/wizard-schema.
const PUBLIC_PATHS = ['/login', '/auth', '/recuperar', '/inscricao', '/api/onboarding']

// A misconfigured environment used to throw from inside createServerClient,
// which the platform reports as MIDDLEWARE_INVOCATION_FAILED: every route 500s
// and the log says nothing about which variable is wrong. This answers with the
// diagnosis instead. It contains no secrets, only the name of the variable and
// what is wrong with it.
function misconfigured(message: string) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configuration problem</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#F6F2EA;color:#14110E;font:400 17px/1.55 system-ui,sans-serif;padding:24px}
  main{max-width:34rem}
  h1{font-size:1.4rem;margin:0 0 .75rem}
  code{background:#EFE9DC;padding:.15em .4em;border-radius:4px;font-size:.9em}
  p{color:#4A433B}
</style></head>
<body><main>
  <h1>Environment not configured</h1>
  <p>${message.replace(/</g, '&lt;')}</p>
  <p>Set it in the hosting provider's environment variables and redeploy. Paste
  the bare value: no quotes around it, no trailing spaces or newlines.</p>
</main></body></html>`

  return new NextResponse(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/**
 * The id of the user this middleware has just verified, passed to the page.
 *
 * ── WHY A HEADER ────────────────────────────────────────────────────────────
 * `auth.getUser()` is a round trip to Supabase: the token is checked against
 * the server rather than trusted. This file makes that call on every request,
 * and then every page made it a second time, through `getAppUser`, to learn
 * the same id. Two sequential calls to the same endpoint before a page could
 * ask for a single row of its own -- about 200ms on a good day, and the auth
 * endpoint has bad ones: 5 seconds was measured on a panel that felt broken.
 *
 * So the answer travels with the request. A page reads this instead of asking
 * again, and nothing about the check is weakened: the value is set here, after
 * the verification, and any copy the browser sent is deleted first, so it
 * cannot be forged. Everything the browser reaches goes through this file --
 * the exclusions in the matcher are the endpoints the voice platform and the
 * scheduler call with a token of their own, and scripts/test-middleware.mjs
 * fails if one of those ever starts reading a user session.
 */
export const VERIFIED_USER_HEADER = 'x-telma-user'

// Refresh the Supabase session on every request and gate private routes.
export async function updateSession(request: NextRequest) {
  // Demo mode: no Supabase, no auth gate. Browse everything freely.
  if (isDemo()) return NextResponse.next({ request })

  // Configured, but wrongly. Say so rather than crashing on every route.
  const problem = supabaseConfigError()
  if (problem) return misconfigured(problem)

  // Held until the end, because the response that carries them is also the one
  // that carries the header below, and it can only be built once.
  let refreshed: CookieToSet[] = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        refreshed = cookiesToSet
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    return NextResponse.redirect(redirectUrl)
  }

  // Whatever the browser sent under this name is dropped, and only what was
  // verified above goes back in.
  const headers = new Headers(request.headers)
  headers.delete(VERIFIED_USER_HEADER)
  if (user) headers.set(VERIFIED_USER_HEADER, user.id)

  const response = NextResponse.next({ request: { headers } })
  refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}
