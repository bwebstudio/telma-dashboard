import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isDemo } from '@/lib/demo/config'
import { supabaseUrl, supabaseAnonKey, supabaseConfigError } from './env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Reachable without a session. `/inscricao` is where a clinic signs itself up,
// so requiring a session there would require an account to create an account.
// `/api/onboarding` is the same flow's HTTP surface, and it authenticates
// nothing: it validates every payload instead, in lib/onboarding/wizard-schema.
const PUBLIC_PATHS = ['/login', '/auth', '/inscricao', '/api/onboarding']

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

// Refresh the Supabase session on every request and gate private routes.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Demo mode: no Supabase, no auth gate. Browse everything freely.
  if (isDemo()) return response

  // Configured, but wrongly. Say so rather than crashing on every route.
  const problem = supabaseConfigError()
  if (problem) return misconfigured(problem)

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
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

  return response
}
