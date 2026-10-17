import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The first hop. One Telma number, many clinics.
 *
 * ── WHY THE CALL COMES HERE FIRST ──────────────────────────────────────────
 * A clinic keeps its own number and forwards to Telma's. Nobody dials Telma's
 * number, so a number per clinic is pure cost, and in Portugal it is the
 * hardest thing in the product to buy.
 *
 * The network already says whose call it is: a forwarded call carries the
 * number that was originally dialled, and Twilio hands it over as
 * `ForwardedFrom`. ElevenLabs does not pass that on -- it gives us the number
 * dialled and the caller's, and nothing else -- so the fact exists for one hop
 * and is then lost.
 *
 * This is that hop. Read who it is for, write it down against the call's id,
 * and hand the call on unchanged. `<Redirect>` keeps the same call: Twilio
 * simply asks the next address what to do, and the next address is the one
 * ElevenLabs was already answering on. Nothing about the conversation changes.
 * A moment later ElevenLabs asks us who to be, quoting that same call id, and
 * /api/voice/init finds the answer waiting.
 *
 * ── WHAT HAPPENS WHEN IT IS NOT FORWARDED ──────────────────────────────────
 * Somebody dialled the Telma number directly, which is what the demonstration
 * line is for. Then the number that was dialled is the answer, exactly as
 * before, and nothing is written down.
 *
 * ── WHY IT NEVER REFUSES A CALL ────────────────────────────────────────────
 * If the clinic cannot be worked out, the call still goes through: ElevenLabs
 * falls back to the number dialled, and if that is nobody's either, the agent
 * answers with the prompt that takes a message. A patient with a swollen face
 * must never hear this layer having an opinion.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Where the call was going before we put ourselves in front of it. */
const ELEVENLABS_INBOUND = 'https://api.us.elevenlabs.io/twilio/inbound_call'

function redirect(): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${ELEVENLABS_INBOUND}</Redirect></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

export async function POST(request: Request) {
  let fields: Record<string, string> = {}
  try {
    const form = await request.formData()
    for (const [k, v] of form.entries()) fields[k] = String(v)
  } catch {
    fields = Object.fromEntries(new URL(request.url).searchParams.entries())
  }

  const callSid = fields.CallSid ?? ''
  const forwardedFrom = (fields.ForwardedFrom ?? '').trim()

  // Everything below is best effort. The call goes on either way.
  try {
    if (callSid && forwardedFrom) {
      const admin = createAdminClient()
      const { data } = await admin.rpc('clinic_by_own_number', { p_number: forwardedFrom })
      const clinicId = (data as string | null) ?? null
      if (clinicId) {
        await admin
          .from('call_routes')
          .upsert(
            { call_sid: callSid, clinic_id: clinicId, forwarded_from: forwardedFrom },
            { onConflict: 'call_sid' }
          )
      } else {
        console.warn('[incoming] forwarded from a number no clinic claims:', forwardedFrom)
      }
    }
  } catch (e) {
    console.error('[incoming]', e instanceof Error ? e.message : e)
  }

  return redirect()
}

/** Twilio can be configured with GET. The call is the same call. */
export async function GET(request: Request) {
  return POST(request)
}
