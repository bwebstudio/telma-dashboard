import {
  addToStock,
  assignNumberCore,
  claimForClinic,
  clinicsAwaitingNumber,
  knownNumbers,
} from '@/lib/numbers/assign'
import { attachStockToClinic } from '@/lib/onboarding/twilio-provisioner'

/**
 * Twilio delivered a number. Nobody had to read an email to find out.
 *
 * ── WHY NOT THE EMAIL ─────────────────────────────────────────────────────
 * The obvious automation is to watch the inbox: Twilio writes when an order
 * completes, and the number is in the message. It is the wrong source. The
 * email is a notification about a fact, and the fact is in the account: a
 * line that exists is listed under IncomingPhoneNumbers whether or not the
 * message arrived, was filed as spam, or had its wording changed. Parsing it
 * would also mean holding a mailbox credential to read human correspondence,
 * which is a large thing to own for a number we can simply ask for.
 *
 * So this asks Twilio. Run often enough, the gap between delivery and the
 * clinic being told is the length of the interval and nothing else.
 *
 * ── WHAT IT DOES, IN ORDER ────────────────────────────────────────────────
 * New lines go on the shelf, pointed at our voice webhook first, because a
 * number bought through the ordering form is pointed nowhere and a line that
 * exists and rings nowhere is worse than no line: the clinic hands it out.
 *
 * Then anybody waiting gets one, oldest first. That is the half that makes
 * this worth scheduling rather than running by hand: a clinic that signed up
 * on Monday with an empty shelf is told on Thursday, by us, without anybody
 * noticing the email had arrived.
 *
 * ── WHAT IT REFUSES TO TOUCH ──────────────────────────────────────────────
 * A number already pointed somewhere that is not us. It learned that on its
 * first run by swallowing the demonstration line, which goes straight to
 * ElevenLabs and is what we show to people who are not customers yet: the
 * next sign-up would have been handed it, and the demo would have started
 * ringing in somebody's clinic.
 */

export interface SyncReport {
  seen: number
  shelved: string[]
  skipped: Array<{ number: string; because: string }>
  assigned: Array<{ clinic: string; number: string; emailed: boolean }>
  stillWaiting: number
  error?: string
}

function countryOf(number: string): 'PT' | 'ES' | null {
  if (number.startsWith('+351')) return 'PT'
  if (number.startsWith('+34')) return 'ES'
  return null
}

/**
 * Where Twilio reports the end of a call, with the secret that lets it in.
 *
 * Built from the voice webhook rather than from a variable of its own: the two
 * are the same deployment by definition, and one address that can drift from
 * the other is one address that will.
 */
function callStatusUrl(): string | null {
  const voice = process.env.TWILIO_VOICE_WEBHOOK_URL?.trim()
  const token = process.env.TELMA_WEBHOOK_TOKEN?.trim()
  if (!voice || !token) return null
  try {
    return `${new URL(voice).origin}/api/webhook/call-status?t=${encodeURIComponent(token)}`
  } catch {
    return null
  }
}

export async function syncTwilioNumbers(): Promise<SyncReport> {
  const empty: SyncReport = { seen: 0, shelved: [], skipped: [], assigned: [], stillWaiting: 0 }

  // ── DUAS MANEIRAS DE NOS AUTENTICARMOS, E A SEGUNDA É MELHOR ───────────
  // O auth token é a chave da conta inteira e não se revoga sem mudar tudo o
  // que o usa. Uma API key revoga-se sozinha, que é o que se quer numa coisa
  // que corre de hora a hora. Aceita-se qualquer uma: a conta já tem o token
  // configurado e não vale a pena parar um cron por uma migração de chaves.
  const account = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET
  const token = process.env.TWILIO_AUTH_TOKEN
  const hook = process.env.TWILIO_VOICE_WEBHOOK_URL

  const pair = keySid && keySecret ? `${keySid}:${keySecret}` : token ? `${account}:${token}` : null
  if (!account || !pair) return { ...empty, error: 'twilio_not_configured' }

  const auth = 'Basic ' + Buffer.from(pair).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers.json?PageSize=200`,
    { headers: { Authorization: auth }, cache: 'no-store' }
  )
  if (!res.ok) return { ...empty, error: `twilio_${res.status}` }

  const body = (await res.json().catch(() => ({}))) as {
    incoming_phone_numbers?: Array<{
      sid?: string
      phone_number?: string
      voice_url?: string
      status_callback?: string
    }>
  }
  const lines = body.incoming_phone_numbers ?? []
  const known = await knownNumbers()
  const report: SyncReport = { ...empty, seen: lines.length }

  // ── EVERY LINE WE OWN REPORTS THE END OF ITS CALLS ──────────────────────
  // Before anything else, and for the numbers already in use as much as for
  // the new ones: this is what makes a call nobody answered exist at all.
  // Twilio only tells us if the number is configured to tell us, and a number
  // bought last August was configured before there was anywhere to tell.
  // Done here because this already runs every hour and already holds the
  // credentials; a setting that heals itself beats a setting somebody has to
  // remember. See 0077 and app/api/webhook/call-status.
  const statusHook = callStatusUrl()
  if (statusHook) {
    for (const line of lines) {
      if (!line.sid || line.status_callback === statusHook) continue
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${line.sid}.json`,
        {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            StatusCallback: statusHook,
            StatusCallbackMethod: 'POST',
          }),
        }
      ).catch(() => null)
    }
  }

  for (const line of lines) {
    const number = (line.phone_number ?? '').replace(/\s/g, '')
    if (!number || !line.sid || known.has(number)) continue

    const country = countryOf(number)
    if (!country) {
      report.skipped.push({ number, because: 'not_pt_or_es' })
      continue
    }
    const url = line.voice_url ?? ''
    if (url && (!hook || url !== hook)) {
      report.skipped.push({ number, because: `points_at_${url}` })
      continue
    }

    if (hook && url !== hook) {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${line.sid}.json`,
        {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ VoiceUrl: hook, VoiceMethod: 'POST' }),
        }
      ).catch(() => null)
    }

    const added = await addToStock({ number, providerRef: line.sid, country })
    if (added.ok) report.shelved.push(number)
    else report.skipped.push({ number, because: added.error ?? 'not_stored' })
  }

  // ── AND NOW WHOEVER WAS WAITING ─────────────────────────────────────────
  // Oldest first, because the one who has waited longest is the one for whom
  // the wait has cost the most.
  for (const clinic of await clinicsAwaitingNumber()) {
    if (!clinic.country) continue
    const line = await claimForClinic(clinic.country, clinic.region)
    if (!line) continue

    const done = await assignNumberCore({
      clinicId: clinic.id,
      number: line.number,
      providerRef: line.providerRef,
    })
    if (done.ok) {
      await attachStockToClinic(line.providerRef, clinic.id)
      report.assigned.push({
        clinic: clinic.name,
        number: line.number,
        emailed: done.emailed === true,
      })
    }
  }

  report.stillWaiting = (await clinicsAwaitingNumber()).length
  return report
}
