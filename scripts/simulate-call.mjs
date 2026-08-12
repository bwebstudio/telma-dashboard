#!/usr/bin/env node
//
// A whole conversation, against the real briefing, without a telephone.
//
//   node --experimental-strip-types scripts/simulate-call.mjs scripts/scenarios/emergencia.mjs
//
// ElevenLabs will simulate a caller against an agent and score the result. What
// it will not do is take a prompt as an argument: `simulate-conversation`
// always uses whatever is stored on the agent, and passes over an override in
// the body without a word. The first run of this looked fine and was testing
// the agent's emergency fallback prompt, not ours.
//
// So a throwaway agent is created from the prompt this codebase generates, the
// conversation is run against that, and the agent is deleted afterwards. The
// live agents are never touched, which matters: one of them answers the demo.
//
// ── WHAT THIS DOES NOT COVER ───────────────────────────────────────────────
// Audio, and everything that comes with it: what the microphone mishears, what
// happens when somebody interrupts, silences, background noise, and the tone
// Telma is actually heard in. This is the words and the order they come in.
// Tools are not attached either, so anything that needs the diary is out of
// scope here; that is what scripts/test-agenda.mjs is for.

import { readFileSync } from 'node:fs'

const KEY = env('ELEVENLABS_API_KEY')
if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')

const scenarioPath = process.argv[2]
if (!scenarioPath) fail('Uso: simulate-call.mjs <ficheiro de cenário>')

const scenario = await import(new URL(`../${scenarioPath}`, import.meta.url).href)
const { clinic, caller, firstMessage, criteria, language = 'es' } = scenario.default

const { buildPrompt, greetingLine, todayInZone } = await import('../lib/onboarding/prompt.ts')
const variables = { ...clinic, today: todayInZone(clinic.timezone, language) }
const built = buildPrompt(variables, language)
const greeting = greetingLine(clinic.clinic_name, language, clinic.formality, clinic.recording, [
  language,
])

console.log(`\n  cenário: ${scenarioPath}`)
console.log(`  prompt:  ${built.text.length} caracteres, versão ${built.version}\n`)

const agent = await api('POST', '/v1/convai/agents/create', {
  name: `zz-simulacao-${Date.now()}`,
  conversation_config: {
    agent: {
      prompt: { prompt: built.text, llm: 'gpt-5.4-mini' },
      first_message: greeting,
      language,
    },
    // Required for any agent that is not in English, and the same model the
    // live agents run. A simulation on a different voice model would be a
    // simulation of a product we do not sell.
    tts: { model_id: 'eleven_turbo_v2_5' },
  },
})

try {
  const result = await api(
    'POST',
    `/v1/convai/agents/${agent.agent_id}/simulate-conversation`,
    {
      simulation_specification: {
        simulated_user_config: {
          prompt: { prompt: caller },
          first_message: firstMessage,
          language,
        },
      },
      extra_evaluation_criteria: criteria,
    }
  )

  for (const turn of result.simulated_conversation ?? []) {
    const who = turn.role === 'agent' ? 'TELMA' : 'PESSOA'
    const said = (turn.message ?? '').trim()
    if (said) console.log(`  ${who} | ${wrap(said)}\n`)
    for (const call of turn.tool_calls ?? []) {
      console.log(`        > ferramenta: ${call.tool_name ?? call.name}\n`)
    }
  }

  const results = result.analysis?.evaluation_criteria_results ?? {}
  console.log('  ── critérios ───────────────────────────────────────────────')
  let failed = 0
  for (const [id, r] of Object.entries(results)) {
    const ok = r.result === 'success'
    if (!ok) failed++
    console.log(`  ${ok ? 'PASSA ' : 'FALHA '} ${id.padEnd(22)} ${wrap(r.rationale ?? '', 24)}`)
  }
  console.log(`\n  ${failed === 0 ? 'todos os critérios passam' : `${failed} critério(s) falham`}\n`)
  process.exitCode = failed === 0 ? 0 : 1
} catch (e) {
  console.error(`\n  ${e.message}\n`)
  process.exitCode = 1
} finally {
  // Always, including after a failure. A simulation agent left behind is one
  // more thing in a list where every other entry answers a real telephone.
  await api('DELETE', `/v1/convai/agents/${agent.agent_id}`).catch(() => {})
}

// ---------------------------------------------------------------------------

async function api(method, path, body) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  // Thrown, never process.exit(). Exiting here skipped the `finally` that
  // deletes the throwaway agent, so a rate limit mid-run left one behind in a
  // list where every other entry answers a real telephone. Which is exactly
  // what happened, twice, before anybody looked at the list.
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n  ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

function wrap(text, indent = 8) {
  const width = 88
  const pad = ' '.repeat(indent) + '| '
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim())
      line = w
    } else line += ' ' + w
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join(`\n${pad}`)
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
