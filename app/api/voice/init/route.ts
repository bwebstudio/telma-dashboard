import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClinicWithPlan } from '@/lib/clinic-utils'
import { voiceId } from '@/lib/onboarding/elevenlabs'
import { toolsForCall } from '@/lib/onboarding/tools'
import { buildPrompt, greetingLine } from '@/lib/onboarding/prompt'
import { promptVariablesFor } from '@/lib/onboarding/variables'

/**
 * What the agent is told, at the moment a call arrives.
 *
 * This is the endpoint that makes one shared agent enough for every clinic.
 * ElevenLabs calls it before the first word is spoken, with the number that was
 * dialled, and takes back the system prompt, the opening line, the language and
 * the voice for that one conversation. Nothing is pasted into the agent by
 * hand, and changing a clinic's hours changes what Telma knows on the next call
 * rather than at the next deploy.
 *
 * The alternative was an agent per clinic, which does not survive five hundred
 * of them, or a prompt pasted per clinic, which is the same thing done by hand.
 *
 * Requires "Enable fetching conversation initiation data" in the agent's
 * Security tab, with prompt, first message, language and voice listed as
 * overridable. Without that ElevenLabs ignores what this returns, silently.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InitRequest {
  caller_id?: string
  agent_id?: string
  called_number?: string
  call_sid?: string
}

export async function POST(request: Request) {
  // Authentication is optional here and that is deliberate, not an oversight.
  // ElevenLabs does not always allow a custom header on this particular
  // webhook, so requiring one would mean the feature could not be switched on
  // at all. When TELMA_VOICE_INIT_TOKEN is set it is enforced; when it is not,
  // the endpoint is still safe to expose because it reveals nothing that is not
  // already read aloud to anyone who rings the number, and it writes nothing.
  const expected = process.env.TELMA_VOICE_INIT_TOKEN?.trim()
  if (expected) {
    const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (got !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  let body: InitRequest
  try {
    body = (await request.json()) as InitRequest
  } catch {
    body = {}
  }

  // The clinic is normally the one that owns the number that was dialled, and
  // there is no second way to find it: guessing would be one clinic answering
  // for another.
  //
  // The exception is the test console in ElevenLabs, which starts a real
  // conversation with a real voice but no phone call, and so sends no number.
  // TELMA_VOICE_INIT_TEST_CLINIC names the clinic to answer as in that case. It
  // is unset in production, where a call with no number is a call that cannot be
  // answered, and this whole branch disappears.
  const dialled = body.called_number?.trim()
  const testClinic = process.env.TELMA_VOICE_INIT_TEST_CLINIC?.trim()

  if (!dialled && !testClinic) {
    return NextResponse.json({ error: 'called_number_required' }, { status: 400 })
  }

  // ── WHOSE CALL IS THIS ────────────────────────────────────────────────────
  // The first hop may already have worked it out. A forwarded call carries the
  // clinic's own number, /api/voice/incoming reads it and writes it down
  // against this call's id, and that is what lets one Telma number serve every
  // clinic instead of one each. See migration 0057.
  //
  // The number dialled is still the answer when there is no note: a direct call
  // to a clinic's own Telma line, which is every clinic today and the
  // demonstration line forever.
  const routed = await clinicByCallSid(body.call_sid)
  const clinicId = routed ?? (dialled ? await clinicIdByPhone(dialled) : (testClinic as string))
  if (!clinicId) {
    // A number nobody owns. Answering with somebody else's clinic would put one
    // clinic's patients in another clinic's diary, so this refuses instead and
    // the agent falls back to whatever it was configured with.
    return NextResponse.json({ error: 'clinic_not_found_for_number' }, { status: 404 })
  }

  // ── SOMEBODY IS BEING ANSWERED ─────────────────────────────────────────
  // Written down against the call the network knows, so that when Twilio
  // reports the end of it we can tell a conversation from a caller who hung
  // up while it rang. Best effort and never in the way: a call must not fail
  // because a note could not be written. See 0077.
  if (typeof body.call_sid === 'string' && body.call_sid.startsWith('CA')) {
    void markAnswered(body.call_sid, clinicId)
  }

  const context = await getClinicWithPlan(clinicId)
  if (!context) return NextResponse.json({ error: 'clinic_not_found' }, { status: 404 })

  // ── A CLINIC THAT IS NO LONGER A CLIENT ───────────────────────────────────
  // Cancelling does not undo a forward: the clinic's patients keep ringing
  // the number on the door and the operator keeps sending those calls here,
  // for as long as nobody dials ##002#. Telma must not answer in the name of
  // a clinic that left -- she would be taking bookings into a diary nobody
  // reads, and speaking for a business that is no longer a client.
  //
  // Refused rather than answered differently: the agent falls back to its own
  // generic configuration, which speaks for nobody. 'pausada' is not this.
  // That is an invoice that has not landed, the clinic is still a client, and
  // she already answers without booking.
  if (context.clinic.status === 'cancelada') {
    return NextResponse.json({ error: 'clinic_no_longer_active' }, { status: 404 })
  }

  const { clinic } = context

  // ── WHAT SHE IS TOLD ABOUT THIS CLINIC ──────────────────────────────────
  // Moved to lib/onboarding/variables so that WhatsApp is told the same
  // things: the same hours, the same services with their prices, the same
  // briefing, the same answer when she cannot help. Two copies of this
  // mapping would drift, and the shape of that drift is a clinic whose Telma
  // says one thing on the telephone and another in writing.
  const { variables, baseLanguage, promptLocale } = await promptVariablesFor({
    clinicId,
    clinic,
    minutesExhausted: context.minutes.exhausted,
    callerId: body.caller_id ?? null,
    channel: 'telefone',
  })

  const built = buildPrompt(variables, baseLanguage)

  // Whether this clinic has anywhere to put a call through to. Either it asked
  // for transfers as its answer when Telma cannot help, or it agreed to be rung
  // out of hours. Anything else and there is no destination, which is a fact
  // about the clinic and not a state of the call.
  const transfersAllowed =
    variables.fallback_policy === 'transfer' || variables.after_hours_transfer

  // The whole sheet, or only the part of it that is true in every sentence.
  //
  // scripts/elevenlabs-procedures.mjs puts the booking, the cancellations, the
  // goodbye and the difficult calls on the agent as procedures, where the
  // platform loads each one when the conversation matches its trigger. Once
  // they are live on the branch answering the telephone, sending them in the
  // prompt as well means every call carries them twice, and the thing this was
  // all for -- ElevenLabs asks for a system prompt under two thousand tokens --
  // does not happen.
  //
  // On by default, now that they are on the agent's Main branch.
  //
  // It is a default and not an environment variable somebody has to remember,
  // because the order of the two changes decides which way a mistake hurts.
  // Procedures live and this still sending the whole sheet means every call
  // carries them twice: worse, and working. This flipped while the procedures
  // were not there yet would mean Telma with no booking, no cancellation and
  // no goodbye: not working at all. So the procedures went first and this
  // follows, and the escape hatch goes the safe way round.
  //
  // TELMA_PROCEDURES_IN_PROMPT=1 puts the whole sheet back, for an agent or a
  // branch that does not have them.
  const procedures = process.env.TELMA_PROCEDURES_IN_PROMPT !== '1'

  // ── AND WHICH TOOLS SHE HAS ───────────────────────────────────────────────
  // For a clinic without a diary, the four diary tools are taken off her hand
  // for this call instead of merely forbidden in the sheet. Three real calls
  // ended with "let me just check that" and a reach for telma_ver_marcacoes on
  // a clinic that has nothing to check, with the sentence saying not to sitting
  // right there in the prompt. See lib/onboarding/tools.ts.
  const tools = toolsForCall({
    agentId: body.agent_id,
    // The same reading the sheet makes of it: anything but an explicit no is
    // a clinic with a diary.
    takesBookings: variables.takes_bookings !== false,
    canTransfer: transfersAllowed,
  })

  return NextResponse.json({
    type: 'conversation_initiation_client_data',
    conversation_config_override: {
      agent: {
        prompt: {
          prompt: procedures ? built.nodes.core : built.text,
          // Absent, rather than empty, where there is nothing to narrow: the
          // platform reads an empty array as "no tools at all", and a call
          // Telma cannot file is worse than the bug this fixes.
          ...(tools?.length ? { tool_ids: tools } : {}),
        },
        // The opening line, authored rather than improvised, so the recording
        // notice is always in it and always in the right language.
        first_message: greetingLine(
          clinic.name,
          promptLocale,
          variables.formality,
          variables.recording,
          // Every language this clinic answers in. With more than one, the
          // greeting offers them, each said in its own language, and the choice
          // is made once at the start instead of guessed at mid-call.
          clinic.selected_languages?.length ? clinic.selected_languages : [promptLocale],
          false,
          // What the clinic wrote, where it wrote one. See 0079.
          clinic.greeting ?? null,
          // Its own clock, for "bom dia" or "boa tarde". The goodbye already
          // follows the clinic's hour; now the hello does too, and from the
          // same boundaries, so a call cannot open in the afternoon and close
          // in the morning.
          clinic.timezone
        ),
        language: promptLocale,
      },
      // No voice override, deliberately.
      //
      // Pinning one here fixes it for the whole conversation, which quietly
      // undoes language switching: a Spanish clinic opened with the Spanish
      // voice, somebody asked for Portuguese, the language changed and the voice
      // did not. What came out was a Spanish woman speaking Portuguese, which is
      // more noticeable than the accent this was all meant to avoid.
      //
      // The agent carries a voice per language instead, so opening in Spanish
      // picks the Spanish one and moving to Portuguese moves the voice with it.
      // `voiceId()` is still what the sign-up preview speaks with, where there is
      // no conversation and nothing to switch.
    },
    // What the tools need. `clinic_id` is the important one: every other
    // endpoint takes it, and this is the only place it can come from.
    dynamic_variables: {
      clinic_id: clinicId,
      clinic_name: clinic.name,
      clinic_timezone: clinic.timezone,
      clinic_language: promptLocale,
      can_book: String(variables.can_book),
      prompt_version: built.version,
      prompt_shape: procedures ? 'core' : 'whole',
      // The call Twilio is holding, so our own transfer tool can move it. The
      // platform's transfer cannot: its destination list is fixed per agent and
      // does not expand variables, which on a real emergency made it dial the
      // word "emergencynumber" on a keypad. See lib/transfer.ts.
      call_sid: body.call_sid ?? '',
      // Read by the built-in transfer tool, which needs a number and cannot be
      // given one per clinic any other way: there is a single shared agent, so
      // the destination has to arrive with the call.
      //
      // Empty string rather than null when there is nobody to ring. The tool
      // then has nothing to dial, which is correct: a clinic that gave no number
      // must not have its main line rung by an agent improvising.
      //
      // And empty for a clinic that does not transfer at all. This used to fall
      // through to `clinic.phone` whatever the policy was, so a clinic whose
      // answer to "I want to speak to someone" is "I will take a message" would
      // have had its own front desk dialled by the tool -- while the base was
      // telling her, correctly, never to say she was putting anybody through.
      // The policy decides, in one place, and the number only exists when it is
      // allowed to be used.
      fallback_number: transfersAllowed
        ? (variables.fallback_number ?? clinic.phone ?? '')
        : '',
      emergency_number: variables.emergency_number ?? '',
    },
  })
}

// Helpers ---------------------------------------------------------------------
// Duplicated from /api/clinic-context on purpose: that endpoint answers a
// different question for a different caller, and coupling the two would mean a
// change for the agent's benefit could break the panel's.

/**
 * The note the first hop left, if it left one.
 *
 * Deliberately silent on failure. A missing note means "nobody told us", which
 * is the ordinary case for a direct call, not an error.
 */
async function clinicByCallSid(callSid: unknown): Promise<string | null> {
  if (typeof callSid !== 'string' || !callSid.startsWith('CA')) return null
  try {
    const { data } = await createAdminClient()
      .from('call_routes')
      .select('clinic_id')
      .eq('call_sid', callSid)
      .maybeSingle()
    return ((data as { clinic_id: string } | null)?.clinic_id) ?? null
  } catch {
    return null
  }
}

/**
 * "This one is being answered", against the call id the network issued.
 *
 * Upserted rather than updated: a direct call to a Telma line has no note from
 * the first hop, because nothing was forwarded, and it still needs the mark.
 */
async function markAnswered(callSid: string, clinicId: string): Promise<void> {
  try {
    await createAdminClient()
      .from('call_routes')
      .upsert(
        { call_sid: callSid, clinic_id: clinicId, answered_at: new Date().toISOString() },
        { onConflict: 'call_sid' }
      )
  } catch (e) {
    console.error('[init] could not mark the call answered:', e instanceof Error ? e.message : e)
  }
}

/**
 * Whose clinic a call dialled straight at a Telma line is.
 *
 * Only reached when there was no forward to read, so the number dialled is the
 * entire evidence. On a line a clinic has to itself that is enough and always
 * was. On the shared line it is not: several clinics answer there, and the one
 * the caller meant is whichever declared itself the owner of direct calls.
 *
 * Null when nobody has. Guessing would book a patient into another clinic's
 * diary, and the agent's own fallback -- take a message -- is a better wrong
 * answer than a confident one. The rule is a unique index, not a convention:
 * see 0059.
 */
async function clinicIdByPhone(raw: string): Promise<string | null> {
  if (raw.replace(/[^\d]/g, '').length < 8) return null
  const admin = createAdminClient()
  const { data } = await admin.rpc('clinic_by_dialled_number', { p_number: raw })
  return (data as string | null) ?? null
}


