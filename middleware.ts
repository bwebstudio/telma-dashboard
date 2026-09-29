import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Run on everything except static assets, the PWA files (which have to be
  // reachable before signing in) and the voice platform's endpoints, which
  // authenticate with TELMA_WEBHOOK_TOKEN rather than a user session.
  //
  // `api/clinic-context` was missing from this list and, being matched, was
  // answering the voice platform with a redirect to /login. Nothing had noticed
  // because nothing had called it yet: it is the first thing an agent asks for
  // at the start of a call, and it would have failed on the first real one.
  //
  // And then `api/service-check` was added and forgotten here too, and answered
  // a 307 to the browser check that caught it. Every route the voice platform
  // calls has to be on this list, and the list is the only thing that says so.
  //
  // And a third time, with `api/cron`. Vercel's scheduler is not a browser and
  // has no session, so the nightly reminder run was answered with a redirect to
  // /login and sent nothing -- on the deployment that has the database, where
  // there was no symptom at all because the job silently succeeded at doing
  // nothing. scripts/test-middleware.mjs now checks this list against the
  // routes, because reading it carefully has failed three times out of three.
  //
  // /api/crm is deliberately included: the offline queue on the phone posts
  // there and needs a refreshed session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|api/cron|api/availability|api/appointments|api/clinic-context|api/service-check|api/voice|dev/voz|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|webmanifest|woff2)$).*)',
  ],
}
