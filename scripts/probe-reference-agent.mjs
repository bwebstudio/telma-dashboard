#!/usr/bin/env node
//
// Talking to somebody else's agent, to learn how it behaves.
//
//   node scripts/probe-reference-agent.mjs "primera frase" "segunda" "tercera"
//
// ElevenLabs' own support agent is the best-tuned conversational agent we have
// access to, and its configuration is not readable with our key: it lives in
// their workspace. What is readable is what it says, through the same public
// widget channel a visitor uses.
//
// This is for reading a shape and bringing it back, not for copying text. Some
// of what it does is wrong for us and knowing which part is the whole exercise:
// it says "prompts de sistema" out loud when it refuses, which suits support
// for a technical product and gives a clinic receptionist away in one sentence.
//
// Text in, text out. No audio, so nothing here says anything about latency.

const AGENT = process.env.REFERENCE_AGENT ?? 'agent_9101k6aqd8ctewj953p8xc6y93sb'
const SCRIPT = process.argv.slice(2)
if (!SCRIPT.length) {
  console.error('\n  Uso: probe-reference-agent.mjs "primera frase" ["segunda" ...]\n')
  process.exit(1)
}

const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT}`)
const said = []
let step = 0
let done = false

const finish = (why) => {
  if (done) return
  done = true
  console.log(`\n  ── ${why} ──`)
  said.forEach((text, i) => {
    const asked = i === 0 ? '(saludo)' : SCRIPT[i - 1]
    console.log(`\n  PREGUNTA  ${asked}`)
    console.log(`  ${text.length} caracteres`)
    console.log(`  ${text.trim().replace(/\s+/g, ' ').replace(/(.{88})/g, '$1\n  ')}`)
  })
  process.exit(0)
}

// Generous, because their agent thinks before it answers and a probe that gives
// up early reports silence as if it were an answer.
setTimeout(() => finish('tiempo agotado'), 40000 + SCRIPT.length * 30000)

ws.onopen = () =>
  ws.send(
    JSON.stringify({
      type: 'conversation_initiation_client_data',
      // Their agent refuses to start without these, which is itself worth
      // noting: it will not open a conversation it cannot personalise.
      dynamic_variables: {
        first_name: 'Domingos',
        email: 'info@bwebstudio.com',
        website: 'telmaatende.com',
        company: '',
        company_size: '',
        company_country: 'Portugal',
        expected_monthly_usage: '',
        company_name: 'your-company',
        form_user_id: 'probe',
      },
    })
  )

ws.onclose = (e) => finish(`cerrado ${e.code} ${e.reason || ''}`)
ws.onerror = (e) => finish(`error ${e.message ?? e.type}`)

ws.onmessage = (ev) => {
  let m
  try {
    m = JSON.parse(ev.data)
  } catch {
    return
  }
  if (m.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event?.event_id }))
    return
  }
  if (m.type === 'conversation_initiation_metadata') {
    setTimeout(() => ws.send(JSON.stringify({ type: 'user_message', text: SCRIPT[step++] })), 1200)
  }
  if (m.type === 'agent_response') {
    said.push(m.agent_response_event?.agent_response ?? '')
    if (step < SCRIPT.length) {
      setTimeout(() => ws.send(JSON.stringify({ type: 'user_message', text: SCRIPT[step++] })), 900)
    } else {
      setTimeout(() => finish('guion terminado'), 4000)
    }
  }
}
