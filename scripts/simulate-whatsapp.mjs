#!/usr/bin/env node --experimental-strip-types
//
// A WhatsApp thread, without WhatsApp.
//
//   node --experimental-strip-types --import ./scripts/resolve-alias.mjs \
//     scripts/simulate-whatsapp.mjs --clinic <uuid>
//
//   ... --lines "Boa tarde, queria marcar uma limpeza|Quinta de manhã|Teresa Marques"
//   ... < guião.txt          uma linha do paciente por linha
//
// ── WHY THIS EXISTS BEFORE THE REST ────────────────────────────────────────
// Everything else the WhatsApp add-on needs is outside this repository: a
// number registered with Meta, a key for the model, a migration run against
// production. This needs one of the three -- the key -- and gives back the
// thing worth having first: what Telma actually writes.
//
// It is the text half of scripts/simulate-call.mjs, and deliberately smaller.
// There is no simulated patient: you type the lines, which costs one model
// call per turn instead of two and lets you push on the sentence that looked
// wrong. For a repeatable run, pass --lines or pipe a file.
//
// ── WHAT IT DOES NOT COVER ─────────────────────────────────────────────────
// Twilio, Meta, the webhook, the twenty-four hour window, and whether a
// message ever arrives. It is the brain and the tools: the sheet for this
// clinic with `channel: 'whatsapp'`, the same five endpoints the telephone
// calls, and the thread as context. The tools are called for real, so a
// booking made here is a booking in that clinic's diary: use a demo clinic.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const CLINIC = arg('clinic') ?? '11111111-1111-1111-1111-111111111111'
const FROM = arg('from') ?? '+351912000111'
const BASE = arg('base') ?? 'https://app.telmaatende.com'

if (!process.env.TELMA_TEXT_MODEL_KEY?.trim()) {
  console.error(`
  Falta TELMA_TEXT_MODEL_KEY.

  É a chave do modelo que escreve as respostas. Põe-na em .env.local para
  ensaiar aqui, e na Vercel quando isto for para produção. Sem ela a Telma
  escreve exactamente nada, que é como o add-on está hoje em produção: cada
  mensagem fica registada e ninguém responde.
`)
  process.exit(1)
}

const { composeReply } = await import('@/lib/whatsapp-brain.ts')

// A ficha, lida em cru para não arrastar lib/clinic-utils, que importa
// next/cache e não corre fora do Next.
const res = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/clinics?id=eq.${CLINIC}&select=*`,
  {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }
)
const clinic = (await res.json())[0]
if (!clinic) {
  console.error(`  Não há clínica ${CLINIC}.`)
  process.exit(1)
}

console.log(`
  ── ${clinic.name} ─────────────────────────────────────────────
  agenda:   ${clinic.takes_bookings === false ? 'não (só recados)' : 'sim'}
  língua:   ${clinic.language}
  endpoints: ${BASE}
`)

if (clinic.takes_bookings === false) {
  console.log(`  Atenção: o add-on é só para clínicas com agenda, por decisão.
  Esta não tem, por isso a folha vai dizer-lhe que não marca. Para ensaiar o
  produto que se vende, aponta --clinic a uma com agenda.
`)
}

const turns = []
const say = async (text) => {
  turns.push({ role: 'patient', text, at: new Date().toISOString() })
  const reply = await composeReply(
    {
      clinic,
      clinicId: CLINIC,
      inbound: { from: FROM, to: clinic.phone ?? FROM, body: text, sid: `sim${Date.now()}`, profileName: null },
      digits: FROM.replace(/\D/g, '').slice(-9),
      minutesExhausted: false,
      baseUrl: BASE,
    },
    turns,
    'simulado'
  )
  if (!reply) {
    console.log('  TELMA  (nada: o modelo não respondeu, ou deu seis voltas sem fechar)\n')
    return
  }
  turns.push({ role: 'telma', text: reply, at: new Date().toISOString() })
  console.log(`  TELMA  ${reply.split('\n').join('\n         ')}\n`)
}

const scripted = arg('lines')
if (scripted) {
  for (const line of scripted.split('|').map((l) => l.trim()).filter(Boolean)) {
    console.log(`  PESSOA ${line}`)
    await say(line)
  }
  process.exit(0)
}

if (!process.stdin.isTTY) {
  const piped = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of piped) {
    console.log(`  PESSOA ${line}`)
    await say(line)
  }
  process.exit(0)
}

console.log('  Escreve como escreveria um paciente. Ctrl+C para sair.\n')
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '  PESSOA ' })
rl.prompt()
rl.on('line', async (line) => {
  const text = line.trim()
  if (!text) return rl.prompt()
  rl.pause()
  await say(text)
  rl.prompt()
})
