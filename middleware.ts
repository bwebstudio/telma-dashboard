import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Run on everything except static assets, the PWA files (which have to be
  // reachable before signing in) and the voice webhooks (token auth, not user
  // sessions). /api/crm is deliberately included: the offline queue on the
  // phone posts there and needs a refreshed session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|api/availability|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|webmanifest|woff2)$).*)',
  ],
}
