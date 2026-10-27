import { createAdminClient } from '@/lib/supabase/admin'
import { WINDOW_MS, sendWhatsappReply } from '@/lib/whatsapp'
import type { Clinic } from '@/lib/types'

/**
 * One WhatsApp message, from arriving to answered.
 *
 * ── THE THREAD IS A ROW IN `calls` ─────────────────────────────────────────
 * Not a table of its own. `calls.channel` has said 'telefone' | 'whatsapp'
 * since the schema was written and the panel's own copy says "ao telefone e no
 * WhatsApp": a receptionist's day is one timeline, and a thread that lived in
 * its own table would need its own chips, its own handled state, its own place
 * on a patient's record and its own counters, all of which already exist.
 *
 * What a thread needs and a call does not is the words, which is the one
 * column 0085 adds. A telephone call's transcript lives at the voice platform
 * for a week and the panel only ever shows the summary; a thread has to be
 * read back turn by turn, because the next reply is built from it.
 *
 * ── AND IT IS OPEN FOR TWENTY-FOUR HOURS ───────────────────────────────────
 * Which is Meta's window and not a number we chose. Inside it, a message from
 * this number belongs to the conversation that is already going; outside it,
 * the business may not write freely anyway, so a message that arrives after is
 * a new conversation in every sense that matters. One rule, two uses.
 */

export interface InboundMessage {
  from: string
  to: string
  body: string
  sid: string
  profileName: string | null
}

export interface AnswerInput {
  clinic: Clinic
  clinicId: string
  inbound: InboundMessage
  /** The last nine digits of the patient's number, which is how every other
   *  part of this product matches a telephone. */
  digits: string
}

export interface AnswerOutcome {
  /** Whether Telma said something back. */
  replied: boolean
  /** Why she did not, where she did not. The webhook returns it and the log
   *  keeps it: "the add-on is on and there is no brain configured" is a
   *  sentence somebody needs to be able to read afterwards. */
  ignored?: string
  /** The thread this message landed in, for the log. */
  thread?: string
}

export interface TranscriptTurn {
  role: 'patient' | 'telma'
  text: string
  at: string
}

/**
 * Whether anything can compose a reply yet.
 *
 * The sheet is ours and the tools are ours; what is missing is the model that
 * reads one and calls the other. It is not the voice platform: ElevenLabs runs
 * a text conversation as a WebSocket session from an SDK, with no documented
 * way to take one turn over HTTP or to resume a conversation by its id, and a
 * WhatsApp thread is turns separated by hours. So this is a model call of our
 * own, with our own prompt, and it needs a key.
 *
 * Until that key is set, every message is still written down -- the clinic sees
 * that somebody wrote, and what they wrote -- and nobody is answered. A silent
 * Telma is a patient who writes again or rings, which is where they were
 * before this existed. A Telma answering out of a half-built brain is a new
 * kind of problem.
 */
export function textBrainConfigured(): boolean {
  return Boolean(process.env.TELMA_TEXT_MODEL_KEY?.trim())
}

export async function answerWhatsapp(input: AnswerInput): Promise<AnswerOutcome> {
  const { clinicId, inbound, digits } = input
  const admin = createAdminClient()
  const now = new Date()

  // ── THE THREAD THIS BELONGS TO ──────────────────────────────────────────
  const since = new Date(now.getTime() - WINDOW_MS).toISOString()
  const { data: open } = await admin
    .from('calls')
    .select('id, transcript, created_at')
    .eq('clinic_id', clinicId)
    .eq('channel', 'whatsapp')
    .eq('from_digits', digits)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const thread = open as { id: string; transcript: TranscriptTurn[] | null } | null
  const patientTurn: TranscriptTurn = {
    role: 'patient',
    text: inbound.body,
    at: now.toISOString(),
  }

  let threadId = thread?.id ?? null
  let turns: TranscriptTurn[] = [...(thread?.transcript ?? []), patientTurn]

  if (!threadId) {
    // ── A NEW CONVERSATION ────────────────────────────────────────────────
    // Zero seconds, because a thread spends no minutes: the add-on is metered
    // in messages and the plan in minutes, and writing a duration here would
    // charge a clinic for time nobody spent. `result` stays null until there
    // is something to say about it, the same as a call in progress.
    //
    // `external_ref` carries the first message's id so that a redelivered
    // webhook -- Twilio retries, and will -- cannot open a second thread for
    // the same first message. 0056 made (clinic, external_ref) unique.
    const { data: created, error } = await admin
      .from('calls')
      .insert({
        clinic_id: clinicId,
        channel: 'whatsapp',
        from_phone: inbound.from.replace(/^whatsapp:/, ''),
        from_digits: digits,
        duration_seconds: 0,
        result: null,
        summary: null,
        transcript: turns,
        external_ref: inbound.sid ? `wa_${inbound.sid}` : null,
        // The name on the WhatsApp account, as a starting point and never as
        // the answer: a husband's handset carries his name and his wife's
        // appointment. Telma asks, the same as on the telephone.
        patient_name: input.inbound.profileName,
      })
      .select('id')
      .maybeSingle()
    if (error || !created) {
      throw new Error(`could not open the thread: ${error?.message ?? 'no row'}`)
    }
    threadId = (created as { id: string }).id
  } else {
    const { error } = await admin
      .from('calls')
      .update({ transcript: turns })
      .eq('id', threadId)
      .eq('clinic_id', clinicId)
    if (error) throw new Error(`could not write the message down: ${error.message}`)
  }

  if (!textBrainConfigured()) {
    // Written down and unanswered, which is the safe half of the job.
    console.warn('[whatsapp] no text model configured; message stored, nobody answered')
    return { replied: false, ignored: 'brain_not_configured', thread: threadId }
  }

  const reply = await composeReply(input, turns)
  if (!reply) return { replied: false, ignored: 'no_reply_composed', thread: threadId }

  const sent = await sendWhatsappReply({
    from: input.clinic.phone ?? '',
    to: inbound.from,
    text: reply,
    lastInboundAt: now,
  })

  if (!sent.ok) {
    console.error('[whatsapp] could not send the reply:', sent.error)
    return { replied: false, ignored: `send_failed:${sent.error}`, thread: threadId }
  }

  turns = [...turns, { role: 'telma', text: reply, at: new Date().toISOString() }]
  await admin.from('calls').update({ transcript: turns }).eq('id', threadId).eq('clinic_id', clinicId)

  return { replied: true, thread: threadId }
}

/**
 * The reply itself, which is the half that is not built yet.
 *
 * Deliberately a seam and not a stub that answers something: see
 * `textBrainConfigured`. What goes in here is the sheet from
 * lib/onboarding/variables with `channel: 'whatsapp'`, the same HTTP tools the
 * telephone uses, and the turns above as the conversation so far.
 */
async function composeReply(_input: AnswerInput, _turns: TranscriptTurn[]): Promise<string | null> {
  return null
}
