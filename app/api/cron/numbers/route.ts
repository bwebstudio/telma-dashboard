import { NextResponse } from 'next/server'
import { syncTwilioNumbers } from '@/lib/numbers/sync'

/**
 * Asks Twilio, every hour, whether the numbers we ordered have arrived.
 *
 * Portuguese and Spanish numbers cannot be bought over the API: they are
 * ordered through a form and delivered days later by a person, who writes an
 * email. Watching that inbox would be the obvious automation and the wrong
 * one. The email is a notification about a fact; the fact is in the account,
 * and the account answers a question rather than a mailbox needing to be
 * read, filed and parsed.
 *
 * Hourly, because the whole point is that nobody is watching. A clinic that
 * signed up on Monday with an empty shelf is told within the hour of the line
 * existing, on a Thursday, by us, with nobody noticing anything had happened.
 *
 * Same guard as the recalls job: Vercel sends `Authorization: Bearer
 * $CRON_SECRET`, and without that variable this route answers nobody. An open
 * endpoint that buys nothing but does send emails to clinics is still one URL
 * away from somebody else sending them.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'cron_secret_unset' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 })
  }

  const report = await syncTwilioNumbers()
  return NextResponse.json({ ok: !report.error, ...report })
}
