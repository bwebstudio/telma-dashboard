import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { activeAddons, getClinicWithPlan } from '@/lib/clinic-utils'
import { digitsOf } from '@/lib/whatsapp'
import { answerWhatsapp } from '@/lib/whatsapp-brain'

/**
 * A patient wrote to the clinic, and Telma reads it.
 *
 * ── THE ONE DECISION THAT SHAPES THIS FILE ─────────────────────────────────
 * The sender is the clinic's own number, not our shared Telma line. On the
 * telephone one line serves every clinic because a forwarded call carries the
 * number it was forwarded from, and that is how /api/voice/incoming knows
 * whose patient is ringing. WhatsApp has nothing of the kind: an inbound
 * message says who wrote and which number they wrote to, and no more. A shared
 * WhatsApp number would be a product that cannot tell two clinics apart.
 *
 * So the clinic registers its own number as the WhatsApp sender, which is also
 * the number its patients already have, and `To` identifies the clinic the
 * same way `ForwardedFrom` does on a call: `clinic_by_own_number_any_status`,
 * the same function, matching on `phone` or on the number they told us they
 * were forwarding.
 *
 * ── WHY IT ANSWERS 200 TO ALMOST EVERYTHING ────────────────────────────────
 * Twilio retries a failure, and there is nothing here worth retrying: a
 * message for a clinic that has not bought this, or has no diary, or left us,
 * will be just as unwanted in five minutes. A 200 with a reason in the body
 * stops the retries and leaves the reason in the log.
 *
 * The exception is our own failure to handle a message we should have handled:
 * that answers 500 on purpose, because a retry is exactly what we want.
 *
 * ── AND WHY SILENCE IS THE SAFE ANSWER ─────────────────────────────────────
 * Every gate below ends in not replying. A patient who gets no answer writes
 * again or rings, which is the situation they were in before this existed. A
 * patient who gets an answer from a clinic that is not paying for one, or a
 * booking from a Telma with no diary to put it in, is a new kind of problem.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The token travels in the query string because Twilio sends no headers on a
 *  messaging webhook, which is the same reason /api/webhook/call-status does
 *  it. Constant time is not the point: the address itself is the secret. */
function authorized(request: Request): boolean {
  const token = process.env.TELMA_WEBHOOK_TOKEN
  if (!token) return false
  const given = new URL(request.url).searchParams.get('t')
  return typeof given === 'string' && given.length === token.length && given === token
}

interface Inbound {
  from: string
  to: string
  body: string
  sid: string
  profileName: string | null
}

async function readInbound(request: Request): Promise<Inbound | null> {
  let fields: Record<string, string> = {}
  try {
    const form = await request.formData()
    for (const [k, v] of form.entries()) fields[k] = String(v)
  } catch {
    fields = Object.fromEntries(new URL(request.url).searchParams.entries())
  }
  const from = (fields.From ?? '').trim()
  const to = (fields.To ?? '').trim()
  if (!from || !to) return null
  return {
    from,
    to,
    body: (fields.Body ?? '').trim(),
    sid: (fields.MessageSid ?? fields.SmsMessageSid ?? '').trim(),
    // WhatsApp hands over the name on the account. It is not the name of the
    // patient -- a husband's handset carries his name and his wife's
    // appointment -- so it is a starting point for the record and never the
    // answer. Telma asks, the same as on the telephone.
    profileName: (fields.ProfileName ?? '').trim() || null,
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const inbound = await readInbound(request)
  if (!inbound) return NextResponse.json({ received: true, ignored: 'no_from_or_to' })

  const admin = createAdminClient()

  // ── WHOSE PATIENT IS THIS ────────────────────────────────────────────────
  const { data: found } = await admin.rpc('clinic_by_own_number_any_status', {
    p_number: inbound.to,
  })
  const clinicId = (found as string | null) ?? null
  if (!clinicId) {
    console.warn('[whatsapp] a message to a number no clinic claims:', inbound.to)
    return NextResponse.json({ received: true, ignored: 'clinic_not_found' })
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) return NextResponse.json({ received: true, ignored: 'clinic_not_found' })
  const { clinic } = context

  // ── THE FOUR GATES, AND EACH OF THEM IS A REASON NOT TO SPEAK ───────────
  // A clinic that left us: the same rule as the telephone. Speaking in the
  // name of a business that is no longer a client is worse than not
  // answering, and the forward and the WhatsApp registration both outlive the
  // contract because neither of them is ours to undo.
  if (clinic.status === 'cancelada') {
    return NextResponse.json({ received: true, ignored: 'clinic_no_longer_active' })
  }

  // Bought and paid for. The add-on is 49 EUR a month and this is the thing it
  // buys; a clinic that has not bought it gets no answer, and nobody finds out
  // afterwards that they had a receptionist on WhatsApp for free.
  if (!activeAddons(clinic).includes('whatsapp')) {
    return NextResponse.json({ received: true, ignored: 'addon_not_active' })
  }

  // ── AND ONLY WHERE THERE IS A DIARY ─────────────────────────────────────
  // The add-on is sold as "o paciente escreve e ela marca, remarca e
  // desmarca". On a clinic that only takes messages that is not what happens:
  // she would take a message and the clinic would answer hours later, outside
  // Meta's twenty-four hour window, where only an approved template goes
  // through. A product whose answer arrives as a template nobody wrote yet is
  // not the product on the price list, so it is not offered there.
  if (clinic.takes_bookings === false) {
    return NextResponse.json({ received: true, ignored: 'clinic_without_diary' })
  }

  // The sender has to be the clinic's own number, registered with WhatsApp.
  // Without one there is nothing to reply from: Twilio refuses the send and
  // the patient is left waiting on a conversation that looked like it started.
  if (!clinic.phone?.trim()) {
    console.warn('[whatsapp] clinic with the add-on and no number of its own:', clinicId)
    return NextResponse.json({ received: true, ignored: 'clinic_without_sender' })
  }

  const digits = digitsOf(inbound.from)
  if (digits.length !== 9) {
    return NextResponse.json({ received: true, ignored: 'sender_not_a_number' })
  }

  try {
    const outcome = await answerWhatsapp({
      clinic,
      clinicId,
      inbound,
      digits,
      minutesExhausted: context.minutes.exhausted,
      // Our own origin, taken from the request that brought the message
      // rather than from an environment variable somebody has to remember:
      // the tools are called over HTTP so that both channels go through one
      // door, and this is the door.
      baseUrl: new URL(request.url).origin,
    })
    return NextResponse.json({ received: true, ...outcome })
  } catch (e) {
    // Ours to fix, so ask for the retry. A message that reached a clinic that
    // pays for this and was dropped by our own error is the one case where
    // Twilio trying again is what we want.
    console.error('[whatsapp] handling failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }
}

/** Twilio can be configured with GET while somebody is setting it up. The
 *  message is the same message. */
export async function GET(request: Request) {
  return POST(request)
}
