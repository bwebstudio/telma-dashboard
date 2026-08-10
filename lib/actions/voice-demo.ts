'use server'

import { headers } from 'next/headers'
import { requireClinicContext } from '@/lib/clinic-context'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Talking to Telma from inside the panel, and then proving what she did.
 *
 * The old simulator was a form: a name, a phone, a duration and a dropdown for
 * how the call ended. It wrote the same rows a real call writes, which made it
 * useful for testing the panel and useless for showing anybody the product.
 * Nobody heard her. Nothing proved she had been told anything about this
 * clinic.
 *
 * This one is the real conversation, on the same configuration a telephone call
 * would get. What it adds is the part a phone cannot: afterwards it shows the
 * transcript and the rows, side by side, so that "she booked it" is something
 * you read rather than something you are told.
 */

export interface VoiceConfig {
  agentId: string
  clinicId: string
  clinicName: string
  greeting: string
  language: string
  voiceId: string
  /** Proof the configuration arrived, without printing the briefing itself. */
  knows: string[]
  dynamicVariables: Record<string, string>
  promptText: string
}

/**
 * What this clinic's Telma should be told, asked of the same endpoint the
 * telephone asks. Over HTTP on purpose: a mistake in that route, or in the way
 * a clinic is found, shows up here rather than only on a real call.
 */
export async function demoVoiceConfig(): Promise<VoiceConfig | { error: string }> {
  const { clinicId, clinic } = await requireClinicContext()
  if (!clinic) return { error: 'clinic' }

  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim()
  if (!agentId) return { error: 'agent' }

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  const res = await fetch(`${proto}://${host}/api/voice/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.TELMA_VOICE_INIT_TOKEN
        ? { Authorization: `Bearer ${process.env.TELMA_VOICE_INIT_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ called_number: clinic.assigned_phone ?? undefined }),
    cache: 'no-store',
  })
  if (!res.ok) return { error: 'init' }

  const init = (await res.json()) as {
    conversation_config_override: {
      agent: { prompt: { prompt: string }; first_message: string; language: string }
      tts?: { voice_id?: string }
    }
    dynamic_variables: Record<string, string>
  }
  const o = init.conversation_config_override

  // Three facts pulled back out of the finished briefing. Not the briefing: a
  // clinic owner reading two thousand words of machine instructions learns
  // nothing, and a competitor reading them learns everything. These are enough
  // to show it is this clinic's configuration and not a generic agent.
  const knows: string[] = []
  const text = o.agent.prompt.prompt
  if (clinic.name && text.includes(clinic.name)) knows.push(clinic.name)
  if (clinic.address && text.includes(clinic.address)) knows.push(clinic.address)
  const hourLine = text.match(/\d{2}:\d{2}-\d{2}:\d{2}/)
  if (hourLine) knows.push(hourLine[0])

  return {
    agentId,
    clinicId,
    clinicName: clinic.name,
    greeting: o.agent.first_message,
    language: o.agent.language,
    // Optional now: the initiation payload stopped sending a voice so that the
    // agent's per-language voices can win. Kept in the shape for the panel to
    // display when there is one.
    voiceId: o.tts?.voice_id ?? '',
    knows,
    dynamicVariables: init.dynamic_variables,
    promptText: text,
  }
}

export interface CallOutcome {
  transcript: Array<{ role: string; message: string; tools: string[] }>
  call: { summary: string | null; result: string | null; duration: number } | null
  appointment: {
    patient_name: string
    patient_phone: string | null
    reason: string | null
    say: string
  } | null
}

/**
 * What the last conversation did, from both sides.
 *
 * The transcript comes from ElevenLabs and the rows from our own database, and
 * showing them together is the whole point: a transcript alone is a claim, and a
 * row alone is a number nobody watched arrive.
 */
export async function lastCallOutcome(): Promise<CallOutcome | { error: string }> {
  const { clinicId, clinic } = await requireClinicContext()
  if (!clinic) return { error: 'clinic' }

  const admin = createAdminClient()
  const { data: calls } = await admin
    .from('calls')
    .select('id, summary, result, duration_seconds, created_at')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
  const call = (calls ?? [])[0] as
    | { id: string; summary: string | null; result: string | null; duration_seconds: number }
    | undefined

  let appointment: CallOutcome['appointment'] = null
  if (call) {
    const { data: appts } = await admin
      .from('appointments')
      .select('patient_name, patient_phone, reason, scheduled_at')
      .eq('call_id', call.id)
      .limit(1)
    const a = (appts ?? [])[0] as
      | { patient_name: string; patient_phone: string | null; reason: string | null; scheduled_at: string }
      | undefined
    if (a) {
      appointment = {
        patient_name: a.patient_name,
        patient_phone: a.patient_phone,
        reason: a.reason,
        say: new Intl.DateTimeFormat(clinic.language === 'es' ? 'es-ES' : 'pt-PT', {
          timeZone: clinic.timezone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(a.scheduled_at)),
      }
    }
  }

  const transcript = await fetchTranscript(process.env.ELEVENLABS_AGENT_ID?.trim())

  return {
    transcript,
    call: call
      ? { summary: call.summary, result: call.result, duration: call.duration_seconds }
      : null,
    appointment,
  }
}

async function fetchTranscript(agentId?: string): Promise<CallOutcome['transcript']> {
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  if (!key || !agentId) return []
  try {
    const list = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=1`,
      { headers: { 'xi-api-key': key }, cache: 'no-store' }
    )
    if (!list.ok) return []
    const { conversations = [] } = (await list.json()) as {
      conversations: Array<{ conversation_id: string }>
    }
    const id = conversations[0]?.conversation_id
    if (!id) return []

    const one = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
      headers: { 'xi-api-key': key },
      cache: 'no-store',
    })
    if (!one.ok) return []
    const detail = (await one.json()) as {
      transcript?: Array<{
        role: string
        message: string | null
        tool_calls?: Array<{ tool_name?: string }>
      }>
    }
    return (detail.transcript ?? [])
      .map((t) => ({
        role: t.role,
        message: (t.message ?? '').trim(),
        tools: (t.tool_calls ?? []).map((c) => c.tool_name ?? '').filter(Boolean),
      }))
      .filter((t) => t.message || t.tools.length)
  } catch {
    // A transcript that will not load must not take the rows down with it: the
    // booking is the thing being demonstrated, and it is ours to show.
    return []
  }
}
