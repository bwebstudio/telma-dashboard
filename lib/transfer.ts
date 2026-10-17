import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Putting a caller through to a person, for real this time.
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 * ElevenLabs has a transfer tool of its own, and it was configured with
 * `{{emergency_number}}` as the destination so that one shared agent could
 * reach each clinic's own line. That field is not a template. On a real call
 * with a real emergency the platform took the string, read it as a telephone
 * number with letters in it, and dialled the letters on a keypad:
 *
 *     emergency -> 363743629      number -> 686237
 *     +363743629686237
 *
 * Twilio refused it, the caller heard nothing, and the call died in silence.
 * The destination list on that tool is fixed per agent, so with one agent
 * serving every clinic it can never be the clinic's own number.
 *
 * So the transfer happens here, where the clinic is known, the number is read
 * from its row, and the call is moved by the only party that can actually move
 * it: Twilio, which is holding the line.
 *
 * ── WHAT A TRANSFER IS, MECHANICALLY ───────────────────────────────────────
 * The caller is on a Twilio call bridged to the agent's audio. Handing Twilio
 * new instructions for that same call tears the bridge down and dials the
 * clinic instead. The caller keeps their line the whole time; what changes is
 * who is on the other end. Telma is gone from the moment it works, which is
 * why she says she is going before it happens.
 *
 * ── WHO IS CALLED, AND WHO DECIDES ─────────────────────────────────────────
 * Not the model. It says what kind of transfer it wants, and the rules here
 * pick the number, so a clinic that never agreed to have its mobile rung at
 * eleven at night does not get rung because a conversation went sideways.
 */

export type TransferKind = 'urgencia' | 'pessoa'

export type TransferOutcome =
  | { ok: true; to: string }
  | { ok: false; because: 'no_number' | 'not_allowed' | 'no_call' | 'failed'; detail?: string }

interface ClinicRow {
  id: string
  name: string
  phone: string | null
  assigned_phone: string | null
  emergency_number: string | null
  fallback_policy: string | null
  fallback_number: string | null
  after_hours_transfer: boolean | null
  after_hours_number: string | null
}

/**
 * The number this clinic has agreed can be rung, for this kind of call.
 *
 * An urgency goes to the emergency line, and falls back to the line the clinic
 * already lets us use for people who ask to speak to somebody. A plain request
 * only travels when the clinic chose transfers: the other two policies are a
 * message and a call back, and both mean nobody's telephone rings now.
 */
export function destinationFor(clinic: ClinicRow, kind: TransferKind): string | null {
  const transfersAllowed = clinic.fallback_policy === 'transfer'
  const clean = (n: string | null | undefined) => {
    const t = (n ?? '').replace(/[\s-]/g, '')
    return /^\+\d{8,15}$/.test(t) ? t : null
  }

  if (kind === 'urgencia') {
    return (
      clean(clinic.emergency_number) ??
      (clinic.after_hours_transfer ? clean(clinic.after_hours_number) : null) ??
      (transfersAllowed ? clean(clinic.fallback_number) ?? clean(clinic.phone) : null)
    )
  }
  return transfersAllowed ? clean(clinic.fallback_number) ?? clean(clinic.phone) : null
}

/**
 * Hand the live call to that number.
 *
 * The caller id is the clinic's own Telma line rather than the patient's
 * number: Twilio only lets us present numbers we hold, and a transfer that is
 * refused for presenting somebody else's caller id is a transfer that does not
 * happen.
 */
export async function transferCall(input: {
  clinicId: string
  callSid: string
  kind: TransferKind
}): Promise<TransferOutcome> {
  if (!/^CA[0-9a-f]{32}$/i.test(input.callSid)) {
    return { ok: false, because: 'no_call', detail: 'call_sid inválido' }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select(
      'id, name, phone, assigned_phone, emergency_number, fallback_policy, fallback_number, after_hours_transfer, after_hours_number'
    )
    .eq('id', input.clinicId)
    .maybeSingle()

  const clinic = data as ClinicRow | null
  if (!clinic) return { ok: false, because: 'no_call', detail: 'clínica não encontrada' }

  const to = destinationFor(clinic, input.kind)
  if (!to) {
    return {
      ok: false,
      because: input.kind === 'pessoa' && clinic.fallback_policy !== 'transfer' ? 'not_allowed' : 'no_number',
    }
  }

  const account = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET
  const token = process.env.TWILIO_AUTH_TOKEN
  const pair = keySid && keySecret ? `${keySid}:${keySecret}` : token ? `${account}:${token}` : null
  if (!account || !pair) return { ok: false, because: 'failed', detail: 'twilio_not_configured' }

  const from = (clinic.assigned_phone ?? '').replace(/[\s-]/g, '')
  // 30 seconds of ringing, then back to a message rather than a dead line: a
  // transfer nobody answers is the normal case, not the exception.
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Dial timeout="30"${from ? ` callerId="${from}"` : ''}><Number>${to}</Number></Dial>` +
    `<Say language="pt-PT">Não foi possível falar com a clínica. Por favor ligue mais tarde.</Say>` +
    `</Response>`

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${input.callSid}.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(pair).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Twiml: twiml }),
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, because: 'failed', detail: `twilio_${res.status}: ${body.slice(0, 200)}` }
  }

  // Written where the clinic will look for it. A transfer is the one thing
  // Telma does that leaves no recording and no summary of its own: the call
  // stops being hers at that moment.
  await admin.from('activity_log').insert({
    clinic_id: clinic.id,
    type: 'call_transferred',
    message:
      input.kind === 'urgencia'
        ? `Urgência passada para ${to}.`
        : `Chamada passada para ${to} a pedido de quem ligou.`,
  })

  return { ok: true, to }
}
