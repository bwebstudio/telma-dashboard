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

// Runs the same call N times against one throwaway agent.
//
// A single verdict is not a result. The same conversation passed a criterion on
// one run and failed it on the next, in both directions, which means every
// pass/fail read off one simulation in this file's history was worth less than
// it looked. What a rule is worth is how often it is obeyed.
const RUNS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7)) || 1)

// The platform stops a simulation at about thirty agent turns and returns what
// it has, mid-sentence, mid-tool-call, with no flag saying so. Three of twelve
// runs in one measurement had been cut like that and were scored anyway, and a
// criterion about how a call ends cannot be judged on a call that never ended.
// Raised, and a run that reaches it is thrown away rather than counted.
const MAX_TURNS = 45

const scenarioPath = process.argv[2]
if (!scenarioPath) fail('Uso: simulate-call.mjs <ficheiro de cenário>')

const scenario = await import(new URL(`../${scenarioPath}`, import.meta.url).href)
const {
  clinic,
  caller,
  firstMessage,
  criteria,
  language = 'es',
  guardrails,
  tools,
  toolMocks,
  dynamicVariables,
} = scenario.default

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
      prompt: { prompt: built.text, llm: 'gpt-5.4-mini', ...(tools ? { tool_ids: tools } : {}) },
      first_message: greeting,
      language,
    },
    // Required for any agent that is not in English, and the same model the
    // live agents run. A simulation on a different voice model would be a
    // simulation of a product we do not sell.
    tts: { model_id: 'eleven_turbo_v2_5' },
  },
  // Platform-level guardrails, when a scenario asks for them. Worth being able
  // to run the same conversation with and without: prompt_injection has an
  // on/off switch and no logging mode, and the action for a triggered content
  // guardrail is end_call. Turning it on blind means finding out whether it
  // hangs up on real patients by hanging up on real patients.
  ...(guardrails ? { platform_settings: { guardrails } } : {}),
})

try {
  const tally = new Map()
  let truncated = 0

  for (let run = 1; run <= RUNS; run++) {
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
          ...(dynamicVariables ? { dynamic_variables: dynamicVariables } : {}),
          // Faked, so a scenario about keeping track of two bookings is not
          // also a test of the demo's database, and so it writes nothing to it.
          // The platform wants each return value as a string, not an object.
          ...(toolMocks
            ? {
                tool_mock_config: Object.fromEntries(
                  Object.entries(toolMocks).map(([name, value]) => [
                    name,
                    { default_return_value: JSON.stringify(value) },
                  ])
                ),
              }
            : {}),
        },
        extra_evaluation_criteria: criteria,
        max_turns: MAX_TURNS,
      }
    )

    // Everything up to the caller hanging up. After that the simulator keeps
    // going anyway: it does not honour its own END_CALL marker, the caller
    // repeats it, and Telma answers each one by registering the call again,
    // until the turn limit. That loop is not Telma being long-winded and not
    // the caller going round in circles, and counting it made a thirteen-turn
    // conversation look like thirty-one. A real telephone hangs up.
    //
    // It does say something true about production, though: she will re-register
    // a call given the chance, which is why the webhook is idempotent on the
    // conversation id.
    const all = result.simulated_conversation ?? []
    const hungUp = all.findIndex((t) => (t.message ?? '').includes('END_CALL'))
    const spoken = hungUp === -1 ? all : all.slice(0, hungUp)
    const turns = spoken.filter((t) => t.role === 'agent').length
    if (turns >= MAX_TURNS) {
      truncated++
      continue
    }

    // Only the last transcript is printed. Five of them is not reading, and the
    // numbers underneath are what the run is for.
    if (run === RUNS) {
      for (const turn of spoken) {
        const who = turn.role === 'agent' ? 'TELMA' : 'PESSOA'
        const said = (turn.message ?? '').trim()
        if (said) console.log(`  ${who} | ${wrap(said)}\n`)
        for (const call of turn.tool_calls ?? []) {
          console.log(`        > ferramenta: ${call.tool_name ?? call.name}\n`)
        }
      }
    }

    for (const [id, r] of Object.entries(result.analysis?.evaluation_criteria_results ?? {})) {
      const seen = tally.get(id) ?? { ok: 0, n: 0, why: '' }
      seen.n++
      if (r.result === 'success') seen.ok++
      else seen.why = r.rationale ?? ''
      tally.set(id, seen)
    }
  }

  const valid = RUNS - truncated
  console.log(`  ── critérios, ${valid} de ${RUNS} passagens válidas ──────────────`)
  if (truncated) console.log(`     ${truncated} cortada(s) no limite de turnos, fora da conta\n`)

  // A threshold per criterion, not one for all of them. A rule about where an
  // emergency goes at 19 in 20 is a failure; a rule about how warmly she says
  // goodbye at 8 in 10 is a Tuesday. Defaults to 0.8 when a scenario says
  // nothing, so leaving it out is a claim about quality, never about safety.
  let below = 0
  for (const [id, { ok, n, why }] of tally) {
    const wanted = criteria.find((c) => c.id === id)?.threshold ?? 0.8
    const rate = n ? ok / n : 0
    const good = rate >= wanted
    if (!good) below++
    const bar = '█'.repeat(ok) + '·'.repeat(Math.max(0, n - ok))
    console.log(
      `  ${good ? ' ' : '!'} ${String(ok).padStart(2)}/${n} ${bar.padEnd(Math.max(n, 5))} ` +
        `${id.padEnd(26)} exige ${Math.round(wanted * 100)}%`
    )
    if (!good && why) console.log(`        ${wrap(why, 8)}`)
  }
  console.log(
    `\n  ${below === 0 ? 'todos os critérios chegam ao seu limiar' : `${below} critério(s) abaixo do limiar`}\n`
  )
  process.exitCode = below === 0 ? 0 : 1
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
