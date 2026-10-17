#!/usr/bin/env node
//
// O número chegou da Twilio. Este script entrega-o à clínica.
//
//   npx tsx scripts/numero.mjs                       lista quem está à espera
//   npx tsx scripts/numero.mjs <clinicId> <número> <PNsid>
//
// Exemplo, a partir do email da Twilio:
//   npx tsx scripts/numero.mjs 179f718f-... +351300602615 PN1a2b3c...
//
// ── PORQUE É À MÃO ──────────────────────────────────────────────────────────
// Nem Portugal nem Espanha aparecem em AvailablePhoneNumbers nesta conta: dos
// 52 países que a Twilio vende por API, nenhum dos nossos dois está lá. Os
// números vêm de um pedido ao suporte, demoram dias e chegam num email escrito
// por uma pessoa. Alguém tem de os trazer para dentro, e é isto.
//
// O que o script faz sozinho: guarda o número, aponta-o para o nosso webhook
// de voz, manda o email à clínica e deixa a nota no registo dela. A parte
// humana é colar um número.
//
// Lê .env.local, como o Next faz.

import { readFileSync } from 'node:fs'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const { assignNumberCore, clinicsAwaitingNumber } = await import('../lib/numbers/assign.ts')

const [, , clinicId, number, providerRef] = process.argv

if (!clinicId) {
  const waiting = await clinicsAwaitingNumber()
  if (!waiting.length) {
    console.log('\n  Ninguém à espera de número.\n')
    process.exit(0)
  }
  console.log(`\n  ${waiting.length} à espera de número:\n`)
  for (const c of waiting) {
    const kind = c.phoneSource === 'ported' ? `desvia de ${c.ownNumber ?? '?'}` : 'número novo'
    console.log(`  ${c.id}`)
    console.log(`     ${c.name}  ·  ${c.country ?? '?'}  ·  ${kind}`)
    console.log(`     ${c.email ?? 'sem email'}  ·  desde ${c.createdAt.slice(0, 10)}\n`)
  }
  console.log('  Para entregar:  npx tsx scripts/numero.mjs <clinicId> <número> <PNsid>\n')
  process.exit(0)
}

if (!number || !providerRef) {
  console.error('\n  Faltam argumentos: <clinicId> <número E.164> <PNsid da Twilio>\n')
  process.exit(1)
}

// ── A LINHA TEM DE TOCAR EM ALGUM LADO ──────────────────────────────────────
// Um número comprado e não apontado é pior do que nenhum: a clínica recebe-o,
// divulga-o, e quem liga ouve silêncio. A Twilio aponta-o na compra quando
// somos nós a comprar; comprado pelo suporte, ninguém o apontou.
const ACCOUNT = process.env.TWILIO_ACCOUNT_SID
const AUTH = process.env.TWILIO_AUTH_TOKEN
const HOOK = process.env.TWILIO_VOICE_WEBHOOK_URL

async function pointAtUs() {
  if (!ACCOUNT || !AUTH) return 'sem credenciais da Twilio: aponte o número à mão na consola'
  if (!HOOK) return 'TWILIO_VOICE_WEBHOOK_URL não está definida: aponte o número à mão'
  const auth = Buffer.from(`${ACCOUNT}:${AUTH}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}/IncomingPhoneNumbers/${providerRef}.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ VoiceUrl: HOOK, VoiceMethod: 'POST' }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return `a Twilio recusou apontar o número (${res.status}): ${body.slice(0, 160)}`
  }
  return null
}

const pointing = await pointAtUs()
const result = await assignNumberCore({ clinicId, number, providerRef })

console.log('')
if (!result.ok) {
  console.error(`  Não foi atribuído: ${result.error}\n`)
  process.exit(1)
}

console.log(`  ${number} entregue a ${result.clinicName}`)
console.log(`  Email para ${result.email}: ${result.emailed ? 'enviado' : 'NÃO SAIU, avise à mão'}`)
console.log(`  Webhook de voz: ${pointing ? `POR FAZER — ${pointing}` : 'apontado para nós'}`)
console.log('')
