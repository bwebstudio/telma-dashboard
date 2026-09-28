/**
 * Putting a message on somebody's telephone. One place, for both reasons.
 *
 * There were two callers of Twilio before this existed, or rather there was one
 * and a second about to be copied out of it. What is in here is not the HTTP
 * request, which is six lines; it is the two things learned the hard way on the
 * first real send, and neither of them would have survived being copied.
 *
 * ── THE NUMBER FIRST, THE NAME AS A FALLBACK ────────────────────────────────
 * The clinic's own line, so a patient can ring back from the message they are
 * holding. Portuguese voice numbers mostly cannot carry an SMS and there is no
 * way to know which without asking: Twilio answered "'From' number
 * +351300602615 is not SMS-capable" on the first real attempt. An alphanumeric
 * sender works there and Portugal takes one without registering it first.
 *
 * Retried here rather than configured per clinic, because a clinic cannot be
 * asked whether its number is SMS-capable and neither can we, before trying.
 * The cost of being wrong is one refused request.
 *
 * ── WHICH IS WHY THE TEXT IS A FUNCTION ─────────────────────────────────────
 * An alphanumeric sender is one-way. Nothing can be replied to, so a message
 * that ends "ligue-nos" with no number is an instruction nobody can follow, and
 * the text has to change when the sender does. Callers hand over a function of
 * one flag rather than a finished string.
 *
 * ── AND WHATSAPP NEEDS A TEMPLATE, NOT BETTER WORDS ─────────────────────────
 * Meta's rule, and it is not optional: a message the business starts, outside
 * the twenty-four hours after the patient last wrote, has to be a template
 * approved in advance. Everything this system sends is outside that window, so
 * free text there is refused rather than merely worse. Until the templates
 * exist, the caller falls back to SMS, which arrives.
 */

import { senderIdFor } from '@/lib/notify-copy'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim()
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim()

export function twilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN)
}

export interface SendResult {
  ok: boolean
  /** Twilio's own words when it refused: "unverified number", "not a mobile
   *  number", "out of funds" are all things a clinic can act on, and "failed"
   *  is not. */
  error: string | null
  /** Which channel actually carried it, which is not always the one asked for. */
  channel: 'sms' | 'whatsapp'
}

export interface SendRequest {
  /** The clinic, for the sender and for the name to fall back to. */
  clinic: { name: string; assigned_phone?: string | null }
  to: string
  /** The message, given the answer to "does the text have to carry the clinic's
   *  number, because the sender is a name?" */
  text: (withPhone: boolean) => string
  channel: 'sms' | 'whatsapp'
  /** The approved template's content sid. Required for WhatsApp; the message
   *  goes in as its single variable, because Meta approves the shape and not
   *  the words inside it. */
  template?: string | null
}

export async function sendToPatient(req: SendRequest): Promise<SendResult> {
  const from = req.clinic.assigned_phone?.trim() || null
  const to = req.to?.trim()
  if (!twilioConfigured() || !from || !to) {
    return { ok: false, error: 'por_configurar', channel: req.channel }
  }

  const attempt = async (sender: string, withPhone: boolean) => {
    const said = req.text(withPhone)
    const body = new URLSearchParams(
      req.channel === 'whatsapp'
        ? {
            To: `whatsapp:${to}`,
            From: `whatsapp:${sender}`,
            ContentSid: req.template as string,
            ContentVariables: JSON.stringify({ '1': said }),
          }
        : { To: to, From: sender, Body: said }
    )
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        cache: 'no-store',
      }
    )
    const payload = (await r.json().catch(() => ({}))) as { message?: string }
    return { ok: r.ok, status: r.status, message: payload.message }
  }

  let res = await attempt(from, false)

  const notSmsCapable = /not SMS-capable|is not a valid.*SMS/i.test(res.message ?? '')
  if (!res.ok && notSmsCapable && req.channel === 'sms') {
    res = await attempt(senderIdFor(req.clinic.name), true)
  }

  return {
    ok: res.ok,
    error: res.ok ? null : res.message || `HTTP ${res.status}`,
    channel: req.channel,
  }
}
