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
// `--listen` says nothing at all and writes down whatever arrives. Silence is
// the one thing a text client can reproduce faithfully on a voice channel, and
// it is a real situation: somebody puts the phone down to find their diary and
// forgets it is in their hand.
const LISTEN = process.argv.includes('--listen')
const SCRIPT = process.argv.slice(2).filter((a) => a !== '--listen')
if (!SCRIPT.length && !LISTEN) {
  console.error('\n  Uso: probe-reference-agent.mjs "primera frase" ["segunda" ...]\n')
  process.exit(1)
}

const ws = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT}`)
const said = []
const started = Date.now()
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
setTimeout(() => finish('tiempo agotado'), LISTEN ? 95000 : 45000 + SCRIPT.length * 60000)

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
  // The greeting arrives as an `agent_response` like any other, and counting it
  // as an answer sent the second line before the first had been replied to: two
  // questions collapsed into one turn and the transcript looked like an answer
  // to a question nobody had asked yet. Wait for a reply to something we said.
  if (m.type === 'agent_response') {
    const text = m.agent_response_event?.agent_response ?? ''
    const secs = Math.round((Date.now() - started) / 1000)
    said.push(LISTEN ? `[+${secs}s] ${text}` : text)
    if (LISTEN) return
    const isGreeting = said.length === 1
    if (!isGreeting && step >= SCRIPT.length) {
      setTimeout(() => finish('guion terminado'), 4000)
      return
    }
    // Nine hundred milliseconds, found by trying. Longer and the agent has
    // already moved on and answers "how can I help you today"; shorter and the
    // message lands while it is still speaking and is dropped in silence. This
    // is a text client on a channel built for speech, and the seam shows.
    //
    // It is reliable for one question and unreliable for a second, so probes
    // here ask one thing at a time. A conversation that needs two turns to make
    // its point has to fit both into one message.
    setTimeout(() => ws.send(JSON.stringify({ type: 'user_message', text: SCRIPT[step++] })), 900)
  }
}
