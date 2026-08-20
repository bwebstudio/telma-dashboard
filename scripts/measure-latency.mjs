#!/usr/bin/env node
//
// How long the line is quiet before the voice starts.
//
//   node scripts/measure-latency.mjs --ours   [--runs=5]
//   node scripts/measure-latency.mjs --theirs [--runs=5]
//
// The one thing about audio that is a number rather than a judgement. Whether
// Telma sounds warm, or natural, or like a machine, is not measurable from
// here and never will be: that needs ears. The gap between somebody finishing
// their sentence and the first sound coming back is a stopwatch.
//
// Measured to the first audio chunk, not to the transcript. The transcript
// arrives when the model has finished thinking; the audio is what the caller
// actually waits through, and the two are not the same number.
//
// It is a floor rather than a real-world figure. There is no microphone here,
// so nothing is spent on hearing the caller stop talking, and a real call adds
// the telephone network on top. Useful for comparing two agents on the same
// wire, which is exactly what it is for.

import { readFileSync } from 'node:fs'

const RUNS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7)) || 5)
const THEIRS = process.argv.includes('--theirs')
const QUESTION = THEIRS
  ? 'What plans do you offer?'
  : 'Hola, quería pedir cita para una limpieza.'

const KEY = env('ELEVENLABS_API_KEY')
const THEIR_AGENT = 'agent_9101k6aqd8ctewj953p8xc6y93sb'
const OUR_AGENT = process.env.MEASURE_AGENT ?? 'agent_9701kzp690x6fnaba03rmp81kt9a'

// The real briefing, pushed over the socket.
//
// Without it the agent falls back to the short emergency prompt it was created
// with — "disculpe, tengo un problema técnico" — because the initiation webhook
// needs a dialled number to find a clinic and there is no telephone here.
// Timing that would flatter us: seventeen thousand characters of context cost
// time before the first token, and the fallback has none of them.
let OVERRIDE = null
if (!THEIRS) {
  const { buildPrompt, greetingLine, todayInZone } = await import('../lib/onboarding/prompt.ts')
  const clinic = (await import('./scenarios/telefone-base.mjs')).default.clinic
  const built = buildPrompt({ ...clinic, today: todayInZone(clinic.timezone, 'es') }, 'es')
  OVERRIDE = {
    agent: {
      prompt: { prompt: built.text },
      first_message: greetingLine(clinic.clinic_name, 'es', 'formal', clinic.recording, ['es']),
      language: 'es',
    },
  }
  console.log(`  prompt: ${built.text.length} caracteres, versión ${built.version}\n`)
}

const times = []
for (let i = 0; i < RUNS; i++) {
  const ms = await once()
  times.push(ms)
  process.stdout.write(`  ${String(ms).padStart(5)} ms\n`)
  await new Promise((r) => setTimeout(r, 1500))
}

const good = times.filter((t) => t > 0).sort((a, b) => a - b)
if (good.length) {
  const median = good[Math.floor(good.length / 2)]
  console.log(`\n  ${THEIRS ? 'ElevenLabs' : 'Telma'}: mediana ${median} ms sobre ${good.length} medidas`)
  console.log(`  rango ${good[0]} - ${good[good.length - 1]} ms\n`)
} else {
  console.log('\n  ninguna medida válida\n')
}

async function once() {
  const url = THEIRS
    ? `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${THEIR_AGENT}`
    : await signed(OUR_AGENT)

  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let asked = 0
    let greeted = false
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      try { ws.close() } catch {}
      resolve(v)
    }
    setTimeout(() => done(-1), 45000)

    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'conversation_initiation_client_data',
          dynamic_variables: VARS(),
          ...(OVERRIDE ? { conversation_config_override: OVERRIDE } : {}),
        })
      )
    ws.onerror = () => done(-1)
    ws.onclose = () => done(-1)
    ws.onmessage = (ev) => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event?.event_id }))
      // The greeting is spoken before anybody says anything, so its audio is
      // not an answer to a question and must not be timed as one.
      // Audio arrives before the transcript, and the greeting is spoken before
      // anybody has said anything, so every chunk is ignored until a question
      // has actually been asked.
      if (m.type === 'audio') return asked ? done(Date.now() - asked) : undefined
      if (m.type === 'agent_response' && !asked && !greeted) {
        greeted = true
        setTimeout(() => {
          asked = Date.now()
          ws.send(JSON.stringify({ type: 'user_message', text: QUESTION }))
        }, 900)
      }
    }
  })
}

function VARS() {
  return THEIRS
    ? { first_name: 'Domingos', email: 'info@bwebstudio.com', website: 'telmaatende.com',
        company: '', company_size: '', company_country: 'Portugal',
        expected_monthly_usage: '', company_name: 'x', form_user_id: 'x' }
    // No `system__` anything: those are the platform's to fill, and sending
    // them closes the socket with "Dynamic variable names cannot start with
    // system__". In a real call they arrive on their own.
    : { clinic_id: '11111111-1111-1111-1111-111111111111',
        clinic_name: 'Clínica Dental Sonrisa', clinic_timezone: 'Europe/Madrid',
        clinic_language: 'es', can_book: 'true', prompt_version: 'lat',
        fallback_number: '', emergency_number: '' }
}

async function signed(agent) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent}`,
    { headers: { 'xi-api-key': KEY } }
  )
  const { signed_url } = await res.json()
  if (!signed_url) throw new Error('sin url firmada')
  return signed_url
}

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* sin .env.local */ }
  return null
}
