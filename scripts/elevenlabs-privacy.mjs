#!/usr/bin/env node
//
// Retention and redaction on the agents, which is where the voice lives.
//
//   node scripts/elevenlabs-privacy.mjs --agent agent_xxx [--dry]
//
// Both agents were created with the platform defaults, and the platform default
// is to keep everything for ever: record_voice on, retention_days -1, no
// redaction. Patients' voices, and what they said was wrong with them, held
// indefinitely by a third party on behalf of clinics who answer for it.
//
// Seven days is what the audio is for: long enough for a clinic to check a
// disputed booking, short enough that it is not an archive.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const AGENT = args[args.indexOf('--agent') + 1]
const DRY = args.includes('--dry')
if (!AGENT || AGENT.startsWith('--')) fail('Falta --agent agent_xxx')

const KEY = env('ELEVENLABS_API_KEY')
if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')

const PRIVACY = {
  record_voice: true,
  // Seven days, and then the audio is deleted rather than merely hidden.
  retention_days: 7,
  delete_audio: true,
  // The transcript goes with the audio, at the same seven days.
  //
  // It used to outlive it, on the reasoning that a clinic settling an argument
  // three weeks later needs to read what was said rather than hear it. That
  // reasoning survived finding out that redaction is an enterprise feature we
  // do not have: unredacted clinical speech sitting for a month on a third
  // party's servers, for a month we do not need it there. Our own copy keeps
  // its thirty days, where we control what is written in the first place.
  delete_transcript_and_pii: true,
  // Applied to what is already there too. Everything recorded so far was
  // recorded under no retention at all.
  apply_to_existing_conversations: true,
  zero_retention_mode: false,
  // Redaction is deliberately absent, not forgotten. The platform offers it,
  // including a `medical` family that is exactly what a clinic needs, and
  // refuses it: "Conversation history redaction is not available for this
  // workspace. This feature requires an enterprise subscription."
  //
  // So the transcript held at ElevenLabs contains whatever the caller said,
  // unredacted, for as long as the transcript is kept. That is a fact for the
  // contract rather than something to be worked around here, and it is the
  // strongest argument for the transcript retention being short.

}

const agent = await api('GET', `/v1/convai/agents/${AGENT}`)
const before = agent.platform_settings?.privacy ?? {}
console.log(`\n  agente: ${agent.name}`)
console.log(`  antes:  retenção ${before.retention_days} dias, apagar áudio ${before.delete_audio}, apagar transcrição ${before.delete_transcript_and_pii}, redação ${before.conversation_history_redaction?.enabled}`)

if (DRY) {
  console.log('\n  --dry: nada foi alterado.\n')
  process.exit(0)
}

await api('PATCH', `/v1/convai/agents/${AGENT}`, {
  platform_settings: { ...agent.platform_settings, privacy: PRIVACY },
})

// Read back. Settings have gone in silently and done nothing on this platform
// before, and this is the one where believing the write is a legal answer.
const after = (await api('GET', `/v1/convai/agents/${AGENT}`)).platform_settings?.privacy ?? {}
console.log(`  depois: retenção ${after.retention_days} dias, apagar áudio ${after.delete_audio}, apagar transcrição ${after.delete_transcript_and_pii}, redação ${after.conversation_history_redaction?.enabled}`)
const ok =
  after.retention_days === 7 && after.delete_audio === true && after.delete_transcript_and_pii === true
console.log(`\n  ${ok ? 'confirmado por leitura' : 'A LEITURA NÃO BATE CERTO'}\n`)
process.exitCode = ok ? 0 : 1

async function api(method, path, body) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) fail(`${method} ${path} -> ${res.status}\n  ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local */
  }
  return null
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}
