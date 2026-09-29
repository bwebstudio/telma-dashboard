import { NextResponse } from 'next/server'
import { sendDueRecalls } from '@/lib/recalls'

/**
 * The once-a-day run that sends the reminders that came due.
 *
 * ── WHY NOT pg_cron, LIKE THE PURGE ─────────────────────────────────────────
 * The nightly purge runs inside Postgres because everything it touches is in
 * Postgres. This has to talk to Twilio, and the account credentials live in the
 * application's environment, not the database's. Putting them in the database
 * to save a route would mean two copies of a secret.
 *
 * ── AND WHY MID-MORNING ─────────────────────────────────────────────────────
 * Nine in the morning UTC, which is nine in Lisbon and ten in Madrid, Monday to
 * Friday. The purge runs at half three in the morning because nobody is looking;
 * this one must not, because somebody is asleep. Every one of these messages
 * asks the patient to ring the clinic, so it goes out when a clinic can answer
 * the telephone. The date arithmetic in migration 0047 already refuses to land a
 * reminder on a weekend, and the schedule agrees with it rather than relying on
 * it.
 *
 * Configured in vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET`,
 * and without that variable set this route answers nobody: an open endpoint that
 * sends messages to patients is one URL away from somebody else sending them.
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

  const report = await sendDueRecalls()
  return NextResponse.json({ ok: true, ...report })
}
