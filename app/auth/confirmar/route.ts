import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Where the link in the email lands.
 *
 * Supabase sends people back here in one of two shapes depending on the flow it
 * chose, and which one arrives is not ours to decide: `?code=` for PKCE, or
 * `?token_hash=&type=` for the older confirmation links. Handling only one works
 * in testing and fails for somebody a month later on a different Supabase
 * version, so both are handled.
 *
 * Nothing here decides anything about the user. It turns a link into a session
 * and gets out of the way; the next page is where a new password is chosen.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = url.searchParams.get('next') ?? '/nova-palavra-passe'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'recovery' | 'email' | 'invite',
      token_hash: tokenHash,
    })
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }

  // An expired or already-used link. Said on the sign-in screen rather than
  // here, because there is nothing to do on this page but leave it.
  return NextResponse.redirect(new URL('/login?expirado=1', url.origin))
}
