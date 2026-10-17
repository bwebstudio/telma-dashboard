import { NextResponse } from 'next/server'
import { syncTwilioNumbers } from '@/lib/numbers/sync'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The once-a-day job: has a number arrived, and is anything past its date.
 *
 * Portuguese and Spanish numbers cannot be bought over the API: they are
 * ordered through a form and delivered days later by a person, who writes an
 * email. Watching that inbox would be the obvious automation and the wrong
 * one. The email is a notification about a fact; the fact is in the account,
 * and the account answers a question rather than a mailbox needing to be
 * read, filed and parsed.
 *
 * Daily, because the plan allows daily. It was hourly, and Vercel refused
 * every deployment that declared it: a Hobby account gets one run a day per
 * job, and two jobs in total.
 *
 * ── AND WHY RETENTION RIDES ALONG ──────────────────────────────────────────
 * `purge_expired()` is what makes the retention periods true: audio at seven
 * days, the caller's number and the summary at ninety, appointments thirty
 * days after a clinic leaves. It was scheduled with pg_cron inside a migration,
 * in a block that swallows its own failure, so on a database where pg_cron is
 * not enabled nothing was ever deleted and nothing said so. A deletion that
 * may or may not be happening is not a retention policy.
 *
 * It runs here instead, on a schedule we can see, because the account has two
 * cron jobs and both are spoken for. Two unrelated things in one job is the
 * price of that; the alternative was a third job the plan refuses, or a policy
 * that exists only in a comment.
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

  // Never allowed to fail the numbers half: a clinic waiting for its line must
  // not go another day because a delete did not go through.
  let purged: unknown = null
  let purgeError: string | null = null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('purge_expired')
    if (error) purgeError = error.message
    else purged = data
    // The notes the first hop leaves for the second are worthless once the
    // call has started, and keeping them is keeping a record of who rang which
    // clinic and when.
    await admin.rpc('purge_call_routes')
  } catch (e) {
    purgeError = e instanceof Error ? e.message : 'purge_failed'
  }

  return NextResponse.json({ ok: !report.error, ...report, purged, purge_error: purgeError })
}
