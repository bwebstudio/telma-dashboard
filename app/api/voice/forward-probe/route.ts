import { createAdminClient } from '@/lib/supabase/admin'

/**
 * TEMPORARY. Not part of the product. Delete the branch when the question is
 * answered.
 *
 * ── THE QUESTION ───────────────────────────────────────────────────────────
 * Today every clinic needs a Telma number of its own, because the number that
 * was dialled is how a call says which clinic it belongs to. Nobody ever dials
 * those numbers: they are the hidden destination of the clinic's own forward.
 * A number per clinic is therefore pure cost, and Portugal is where that cost
 * is hardest to buy.
 *
 * When a telephone forwards a call, the network can pass on the number that
 * was originally dialled. Twilio surfaces it as `ForwardedFrom`. If Portuguese
 * and Spanish operators pass it, one Telma number can serve every clinic:
 * `ForwardedFrom` says which clinic, `From` says who is calling. If they do
 * not pass it, the whole idea is dead and we stop thinking about it.
 *
 * That is not a question anybody can answer from documentation. It depends on
 * the operator, on the handset, and on which of the three forwarding codes was
 * used. So this answers it by being rung.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 * Writes down every parameter Twilio sends and says one sentence, so the
 * person holding the phone knows the call arrived. It books nothing, bills
 * nothing and touches no clinic data: the rows go in the activity log under
 * the demonstration clinic, where they can be read and then deleted.
 *
 * The `k` in the URL is not security, it is a lock on a door nobody should be
 * at: this endpoint is only ever pointed at by a number we are testing.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The demonstration clinic. The rows have to hang on something. */
const PROBE_CLINIC = '11111111-1111-1111-1111-111111111111'

function twiml(said: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-PT">${said}</Say><Hangup/></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  )
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (!url.searchParams.get('k')) return twiml('Sonda sem chave.')

  // Twilio posts form-encoded. Everything is kept, because the interesting
  // field may be one nobody thought to ask for.
  let fields: Record<string, string> = {}
  try {
    const form = await request.formData()
    for (const [k, v] of form.entries()) fields[k] = String(v)
  } catch {
    fields = Object.fromEntries(url.searchParams.entries())
  }

  const seen = {
    at: new Date().toISOString(),
    label: url.searchParams.get('label') ?? '',
    // The three that decide the answer.
    To: fields.To ?? null,
    From: fields.From ?? null,
    ForwardedFrom: fields.ForwardedFrom ?? null,
    // Everything else, for when the three above do not explain what happened.
    CallSid: fields.CallSid ?? null,
    Direction: fields.Direction ?? null,
    CallerName: fields.CallerName ?? null,
    FromCity: fields.FromCity ?? null,
    FromCountry: fields.FromCountry ?? null,
    StirVerstat: fields.StirVerstat ?? null,
    all: Object.keys(fields).sort().join(','),
  }

  try {
    await createAdminClient()
      .from('activity_log')
      .insert({
        clinic_id: PROBE_CLINIC,
        type: 'forward_probe',
        message: JSON.stringify(seen),
      })
  } catch {
    // The call still has to be answered, or the person testing hears silence
    // and cannot tell a failed probe from a failed forward.
  }

  return twiml(
    seen.ForwardedFrom
      ? 'Recebido. A rede passou o número de origem.'
      : 'Recebido. A rede não passou o número de origem.'
  )
}

/** Twilio can be configured with GET. Same answer either way. */
export async function GET(request: Request) {
  return POST(request)
}
