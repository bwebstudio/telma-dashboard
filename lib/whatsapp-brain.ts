import { createAdminClient } from '@/lib/supabase/admin'
import { buildPrompt } from '@/lib/onboarding/prompt'
import { promptVariablesFor } from '@/lib/onboarding/variables'
import { WINDOW_MS, sendWhatsappReply } from '@/lib/whatsapp'
import { TEXT_TOOLS, runTextTool } from '@/lib/whatsapp-tools'
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
  /** Whether the plan's minutes are spent. The sheet reads it to decide
   *  whether she may book, and the caller has already read the plan. */
  minutesExhausted: boolean
  /** Where our own endpoints are, taken from the request that brought the
   *  message. The tools are called over HTTP so that both channels go through
   *  one door with one token. */
  baseUrl: string
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

  const reply = await composeReply(input, turns, threadId)
  if (!reply) return { replied: false, ignored: 'no_reply_composed', thread: threadId }

  const sent = await sendWhatsappReply({
    // ── THE SENDER IS THE NUMBER THEY WROTE TO ────────────────────────────
    // Not `clinic.phone` read back out of the row. In production the two are
    // the same thing -- the clinic is found *by* the number the message
    // arrived at -- so reading it again adds a way for them to disagree and
    // nothing else. And it is what makes Twilio's sandbox work without a
    // special case: there the number belongs to Twilio, the clinic is named
    // by TELMA_WHATSAPP_TEST_CLINIC, and the reply still goes out from the
    // number the tester wrote to.
    from: inbound.to.replace(/^whatsapp:/, ''),
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
 * The reply itself: the clinic's own sheet, the same tools, and a model.
 *
 * Exported for scripts/simulate-whatsapp.mjs, which types a patient's lines at
 * it and prints what comes back. That harness is the only way to read a thread
 * before a WhatsApp sender exists, and it is the text half of what
 * scripts/simulate-call.mjs does for a call.
 *
 * ── WHY NOT THE VOICE PLATFORM ─────────────────────────────────────────────
 * ElevenLabs runs a text conversation as a WebSocket session opened by an SDK.
 * There is no documented way to take a single turn over HTTP, and none to
 * resume a conversation by its id. A WhatsApp thread is turns separated by
 * minutes or hours, on a server that does not stay alive between requests, so
 * the shape does not fit: we would be holding a socket open for a conversation
 * that may continue tomorrow, or replaying the history into a new one each
 * time and keeping the state ourselves anyway.
 *
 * Keeping the state ourselves is the part we want: the thread is a row in the
 * panel, which is where the clinic reads it. What is left for the platform to
 * add is the model, and we can call one directly with the sheet we already
 * build per clinic. One sheet, two doors, and the voice stays where voice is
 * worth paying for.
 *
 * ── THE LOOP, AND WHY IT IS SHORT ──────────────────────────────────────────
 * Six rounds. A booking is three tools at the most -- look, hold, file -- and
 * a model that has asked for eight is a model that has lost the thread. The
 * cap is a cost ceiling and an honesty one: when it is reached nothing is
 * sent, because a half-finished booking answered with a cheerful sentence is
 * the failure this whole product is written against.
 */
export async function composeReply(
  input: AnswerInput,
  turns: TranscriptTurn[],
  threadId: string
): Promise<string | null> {
  const key = process.env.TELMA_TEXT_MODEL_KEY?.trim()
  if (!key) return null
  const model = process.env.TELMA_TEXT_MODEL?.trim() || 'gpt-5.4-mini'
  const endpoint =
    process.env.TELMA_TEXT_MODEL_URL?.trim() || 'https://api.openai.com/v1/chat/completions'
  const token = process.env.TELMA_WEBHOOK_TOKEN?.trim()
  if (!token) {
    console.error('[whatsapp] no TELMA_WEBHOOK_TOKEN, so the tools cannot be called')
    return null
  }

  const { variables, baseLanguage } = await promptVariablesFor({
    clinicId: input.clinicId,
    clinic: input.clinic,
    minutesExhausted: input.minutesExhausted,
    callerId: input.inbound.from.replace(/^whatsapp:/, ''),
    channel: 'whatsapp',
  })
  const sheet = buildPrompt(variables, baseLanguage)

  // The thread, oldest first, as the model expects it. A WhatsApp thread is
  // the whole context: there is no summary of it anywhere else, which is the
  // other reason the words are kept in `calls.transcript`.
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: sheet.text },
    ...turns.map((t) => ({
      role: t.role === 'patient' ? 'user' : 'assistant',
      content: t.text,
    })),
  ]

  const ctx = {
    clinicId: input.clinicId,
    fromPhone: input.inbound.from.replace(/^whatsapp:/, ''),
    // The thread's reference, so that filing updates the row that already
    // holds the words. Opened with the first message's id; falls back to the
    // row id for a thread whose first message arrived without one.
    callRef: input.inbound.sid ? `wa_${input.inbound.sid}` : `wa_${threadId}`,
    baseUrl: input.baseUrl,
    token,
  }

  for (let round = 0; round < 6; round++) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        tools: TEXT_TOOLS,
        // Short, for the same reason the voice agent has a ceiling: a
        // paragraph is not a WhatsApp message.
        max_tokens: 400,
      }),
      cache: 'no-store',
    })

    if (!r.ok) {
      console.error('[whatsapp] the model refused:', r.status, (await r.text()).slice(0, 200))
      return null
    }

    const data = (await r.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
      }>
    }
    const reply = data.choices?.[0]?.message
    if (!reply) return null

    const calls = reply.tool_calls ?? []
    if (!calls.length) {
      const said = (reply.content ?? '').trim()
      return said || null
    }

    messages.push(reply as Record<string, unknown>)
    for (const call of calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      const result = await runTextTool(call.function.name, args, ctx)
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  // Six rounds and no sentence. Nothing is sent: see above.
  console.error('[whatsapp] the model went round six times without answering')
  return null
}
