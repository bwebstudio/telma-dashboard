/**
 * Telma's half of a WhatsApp conversation: sending it.
 *
 * ── WHY THIS IS NOT lib/sms.ts ─────────────────────────────────────────────
 * That file sends a message the clinic starts: a reminder, a confirmation, a
 * recall. Outside the twenty-four hours after the patient last wrote, Meta
 * only carries an approved template, and everything a clinic starts is outside
 * it, so that file is built around templates and falls back to SMS when there
 * is none.
 *
 * This is the opposite case and the easy one: a reply, inside the window, to
 * somebody who just wrote. Free text is allowed there and no template exists
 * for a conversation, because the whole point is that nobody wrote it in
 * advance.
 *
 * ── WHO SENDS IT ───────────────────────────────────────────────────────────
 * The clinic's own number, which is the number registered with WhatsApp and
 * the number the patient already had. Not `assigned_phone`: that is the Telma
 * line the clinic forwards its calls to, it is shared by every clinic that
 * forwards, and a shared WhatsApp sender could not tell whose patient was
 * writing -- WhatsApp carries no equivalent of the `ForwardedFrom` that makes
 * one voice line serve everybody.
 *
 * So `phone` is the sender here, and a clinic with no WhatsApp sender
 * registered cannot be replied to at all. That is checked where it matters,
 * in /api/whatsapp/incoming, before anybody is promised anything.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim()
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim()
const API_KEY_SID = process.env.TWILIO_API_KEY_SID?.trim()
const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET?.trim()

/** Either credential Twilio accepts, the same order as lib/sms and
 *  lib/transfer: a scoped key where there is one, the account token where
 *  there is not. */
function credentials(): string | null {
  if (API_KEY_SID && API_KEY_SECRET) return `${API_KEY_SID}:${API_KEY_SECRET}`
  if (ACCOUNT_SID && AUTH_TOKEN) return `${ACCOUNT_SID}:${AUTH_TOKEN}`
  return null
}

export function whatsappConfigured(): boolean {
  return Boolean(ACCOUNT_SID && credentials())
}

/**
 * Meta's window, in milliseconds.
 *
 * Twenty-four hours from the patient's last message. Inside it a business may
 * write what it likes; outside it only an approved template goes through, and
 * a free-text send is refused rather than merely frowned upon. Checked here so
 * that the refusal is ours and legible, instead of a Twilio error code at the
 * end of a stack.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000

export interface WhatsappReply {
  /** The clinic's own number, the one registered as the WhatsApp sender. */
  from: string
  /** The patient, in the form WhatsApp gave us. */
  to: string
  text: string
  /** When the patient last wrote. The window is counted from this. */
  lastInboundAt: Date
}

export interface WhatsappResult {
  ok: boolean
  /** Twilio's own words when it refused, or ours when we did. A clinic can act
   *  on "sender not registered"; it cannot act on "failed". */
  error: string | null
  sid: string | null
}

export async function sendWhatsappReply(reply: WhatsappReply): Promise<WhatsappResult> {
  const from = reply.from?.trim()
  const to = reply.to?.trim()
  const text = reply.text?.trim()

  if (!whatsappConfigured()) return { ok: false, error: 'twilio_por_configurar', sid: null }
  if (!from) return { ok: false, error: 'clinica_sem_numero', sid: null }
  if (!to || !text) return { ok: false, error: 'mensagem_vazia', sid: null }

  // ── THE WINDOW, BEFORE THE REQUEST ───────────────────────────────────────
  // A reply that arrives twenty-five hours later is not a slow reply, it is a
  // refused one, and the patient is left with their question unanswered and no
  // sign of it. Answered here so the caller can do the other thing -- hand it
  // to the clinic as a message to follow up -- instead of discovering it from
  // an error nobody reads.
  if (Date.now() - reply.lastInboundAt.getTime() > WINDOW_MS) {
    return { ok: false, error: 'fora_da_janela', sid: null }
  }

  const body = new URLSearchParams({
    To: `whatsapp:${to.replace(/^whatsapp:/, '')}`,
    From: `whatsapp:${from}`,
    Body: text,
  })

  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(credentials() ?? '').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    })
    const data = (await r.json()) as { sid?: string; message?: string; code?: number }
    if (!r.ok) {
      // 63016 is "free-form message outside the window", which we check for
      // above and which Twilio can still answer when the clocks disagree.
      return { ok: false, error: data.message ?? `twilio_${r.status}`, sid: null }
    }
    return { ok: true, error: null, sid: data.sid ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'rede', sid: null }
  }
}

/** The digits WhatsApp gives us, in the shape the rest of the product matches
 *  numbers by: the last nine, the same as every other telephone here. */
export function digitsOf(waNumber: string | null | undefined): string {
  return (waNumber ?? '').replace(/^whatsapp:/, '').replace(/\D/g, '').slice(-9)
}
