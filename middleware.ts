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
  // /api/crm is deliberately included: the offline queue on the phone posts
  // there and needs a refreshed session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|api/availability|api/appointments|api/clinic-context|api/voice|dev/voz|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|webmanifest|woff2)$).*)',
  ],
}
