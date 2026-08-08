#!/usr/bin/env node
//
// Liga e desliga a busca dos dados de arranque por webhook.
//
//   node scripts/elevenlabs-init-webhook.mjs            (diz como está)
//   node scripts/elevenlabs-init-webhook.mjs --off      (para testar no browser)
//   node scripts/elevenlabs-init-webhook.mjs --on       (para o telefone)
//
// ── PORQUE É QUE ISTO É UM INTERRUPTOR E NÃO UMA DEFINIÇÃO ──────────────────
// Ligado, a ElevenLabs vai buscar as variáveis ao nosso /api/voice/init e ignora
// as que o cliente manda. É o que o telefone precisa: quem liga não escolhe de
// que clínica é.
//
// Só que numa sessão de browser a ElevenLabs não chega a chamar o webhook, e
// como também não aceita as do cliente, a conversa arranca sem `clinic_id` e
// morre em "Missing required dynamic variables in tools". Desligado, passa a
// aceitar as do cliente, e a página /dev/voz manda exactamente as mesmas que o
// webhook mandaria.
//
// Ficar desligado é o erro caro: o telefone deixa de saber de que clínica se
// trata e toda a gente ouve a Telma de emergência. Por isso isto avisa, alto,
// sempre que o deixa desligado.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const ON = args.includes('--on')
const OFF = args.includes('--off')

const env = (n) => {
  if (process.env[n]) return process.env[n].trim()
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^\\s*${n}\\s*=\\s*(.+)\\s*$`))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const KEY = env('ELEVENLABS_API_KEY')
const AGENT = args.find((a) => a.startsWith('agent_')) ?? env('ELEVENLABS_AGENT_ID')
if (!KEY || !AGENT) {
  console.error('\n  Faltam ELEVENLABS_API_KEY ou ELEVENLABS_AGENT_ID.\n')
  process.exit(1)
}

const api = async (path, method = 'GET', body) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(JSON.stringify(j?.detail ?? j).slice(0, 300))
  return j
}

const agent = await api(`/convai/agents/${AGENT}`)
const overrides = agent.platform_settings?.overrides ?? {}
const now = overrides.enable_conversation_initiation_client_data_from_webhook

if (!ON && !OFF) {
  console.log(`\n  ${agent.name}: webhook de arranque ${now ? 'LIGADO (telefone)' : 'DESLIGADO (browser)'}\n`)
  process.exit(0)
}

await api(`/convai/agents/${AGENT}`, 'PATCH', {
  platform_settings: {
    ...agent.platform_settings,
    overrides: { ...overrides, enable_conversation_initiation_client_data_from_webhook: ON },
  },
})

const after = await api(`/convai/agents/${AGENT}`)
const got = after.platform_settings?.overrides?.enable_conversation_initiation_client_data_from_webhook
if (got !== ON) {
  console.error(`\n  Não ficou: pedi ${ON}, está ${got}.\n`)
  process.exit(1)
}

if (ON) {
  console.log('\n  Webhook de arranque LIGADO. O telefone volta a saber de que clínica se trata.\n')
} else {
  console.log(`
  Webhook de arranque DESLIGADO.

  Serve para falar com ela em /dev/voz, que manda as variáveis do lado do
  cliente. Enquanto estiver assim, uma chamada de telefone a sério não sabe de
  que clínica é e atende com o prompt de emergência.

  Volte a ligá-lo com:  node scripts/elevenlabs-init-webhook.mjs --on
`)
}
