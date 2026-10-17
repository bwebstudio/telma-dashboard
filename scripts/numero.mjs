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

const { assignNumberCore, clinicsAwaitingNumber, stockLevels, addToStock, knownNumbers } =
  await import('../lib/numbers/assign.ts')

const [, , first, ...rest] = process.argv

// ── CREDENCIAIS DA TWILIO ───────────────────────────────────────────────────
// As da aplicação primeiro. A chave de API serve de alternativa para quem
// corre isto numa máquina que não tem o auth token.
const ACCOUNT = process.env.TWILIO_ACCOUNT_SID
const AUTH = process.env.TWILIO_AUTH_TOKEN
const KEY_SID = process.env.CLAUDE_API_KEY_TWILIO_SID
const KEY_SECRET = process.env.CLAUDE_API_KEY_TWILIO_SECRET
const HOOK = process.env.TWILIO_VOICE_WEBHOOK_URL

function twilioAuth() {
  if (ACCOUNT && AUTH) return Buffer.from(`${ACCOUNT}:${AUTH}`).toString('base64')
  if (KEY_SID && KEY_SECRET) return Buffer.from(`${KEY_SID}:${KEY_SECRET}`).toString('base64')
  return null
}

async function twilioAccountSid(auth) {
  if (ACCOUNT) return ACCOUNT
  const res = await fetch('https://api.twilio.com/2010-04-01/Accounts.json?PageSize=1', {
    headers: { Authorization: `Basic ${auth}` },
  })
  const body = await res.json().catch(() => ({}))
  return body.accounts?.[0]?.sid ?? null
}

/** +351... é Portugal, +34... é Espanha. Nada mais vendemos. */
function countryOf(number) {
  if (number.startsWith('+351')) return 'PT'
  if (number.startsWith('+34')) return 'ES'
  return null
}

// ── sync: o lote que chegou, todo de uma vez ────────────────────────────────
// Um pedido de vinte números chega como vinte linhas na conta da Twilio e
// vinte emails. Pô-los na prateleira à mão é vinte vezes a mesma colagem, e
// é onde se erra um dígito. Isto lê a conta, vê quais ainda não conhecemos,
// aponta-os para nós e guarda-os.
if (first === 'sync') {
  const auth = twilioAuth()
  if (!auth) {
    console.error('\n  Sem credenciais da Twilio no .env.local.\n')
    process.exit(1)
  }
  const account = await twilioAccountSid(auth)
  if (!account) {
    console.error('\n  Não consegui descobrir a conta da Twilio.\n')
    process.exit(1)
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers.json?PageSize=200`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  const body = await res.json().catch(() => ({}))
  const lines = body.incoming_phone_numbers ?? []
  const known = await knownNumbers()

  // ── UM NÚMERO QUE JÁ APONTA PARA ALGUM LADO ESTÁ A SER USADO ─────────────
  // A primeira vez que isto correu engoliu a linha de demonstração, que
  // aponta directamente para a ElevenLabs e é a que mostramos a quem ainda
  // não é cliente. Teria sido entregue à inscrição seguinte, e a demonstração
  // passaria a tocar numa clínica.
  //
  // A regra: um número já apontado para outro sítio tem dono. Só entram os
  // que não apontam para lado nenhum, ou que já apontam para nós. `--force`
  // existe para o dia em que se quer mesmo recuperar um deles.
  const force = rest.includes('--force')
  const inUse = []
  const fresh = lines.filter((n) => {
    const number = (n.phone_number ?? '').replace(/\s/g, '')
    if (known.has(number)) return false
    const url = n.voice_url || ''
    const mine = !url || (HOOK && url === HOOK)
    if (!mine && !force) {
      inUse.push({ number, url })
      return false
    }
    return true
  })

  for (const n of inUse) {
    console.log(`\n  ${n.number} ignorado: já aponta para ${n.url}`)
    console.log('     Se mesmo assim o quer na prateleira: sync --force')
  }
  if (!fresh.length) {
    console.log(`\n  ${lines.length} número(s) na Twilio, nenhum novo.\n`)
    process.exit(0)
  }

  console.log(`\n  ${fresh.length} número(s) novo(s):\n`)
  for (const n of fresh) {
    const number = (n.phone_number ?? '').replace(/\s/g, '')
    const country = countryOf(number)
    if (!country) {
      console.log(`  ${number}  ignorado: não é PT nem ES`)
      continue
    }

    // Apontá-lo para nós antes de o guardar. Um número comprado pelo
    // formulário não ficou apontado a lado nenhum, e um número que existe e
    // não toca é pior do que nenhum: a clínica distribui-o.
    let pointed = 'sem webhook configurado'
    if (HOOK) {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${n.sid}.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ VoiceUrl: HOOK, VoiceMethod: 'POST' }),
        }
      )
      pointed = r.ok ? 'apontado' : `a Twilio recusou (${r.status})`
    }

    const added = await addToStock({ number, providerRef: n.sid, country })
    console.log(
      `  ${number}  ${country}  ${added.ok ? 'na prateleira' : `NÃO guardado: ${added.error}`}  ·  ${pointed}`
    )
  }
  console.log('')
  process.exit(0)
}

// ── A PRATELEIRA ────────────────────────────────────────────────────────────
// `stock`           o que lá está
// `stock-add ...`   põe lá um número acabado de comprar
if (first === 'stock') {
  const rows = await stockLevels()
  if (!rows.length) {
    console.log('\n  Prateleira vazia. Encomende em lote pela Private Offering form.\n')
    process.exit(0)
  }
  console.log('\n  Prateleira:\n')
  for (const r of rows) {
    const lane = r.region ? `${r.country} ${r.region}` : r.country
    const warn = r.free === 0 ? '   <- VAZIA' : r.free <= 2 ? '   <- a acabar' : ''
    console.log(`  ${lane.padEnd(18)} livres ${String(r.free).padStart(3)}   entregues ${String(r.taken).padStart(3)}${warn}`)
  }
  console.log('')
  process.exit(0)
}

if (first === 'stock-add') {
  const [num, sid, country, region] = rest
  if (!num || !sid || !country) {
    console.error('\n  npx tsx scripts/numero.mjs stock-add <número> <PNsid> <PT|ES> [região]\n')
    process.exit(1)
  }
  const r = await addToStock({ number: num, providerRef: sid, country, region: region ?? null })
  console.log('')
  if (!r.ok) {
    console.error(`  Não foi guardado: ${r.error}\n`)
    process.exit(1)
  }
  console.log(`  ${num} na prateleira (${country}${region ? ' ' + region : ''}).\n`)
  process.exit(0)
}

const clinicId = first
const [number, providerRef] = rest

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
async function pointAtUs() {
  const auth = twilioAuth()
  if (!auth) return 'sem credenciais da Twilio: aponte o número à mão na consola'
  if (!HOOK) return 'TWILIO_VOICE_WEBHOOK_URL não está definida: aponte o número à mão'
  const account = await twilioAccountSid(auth)
  if (!account) return 'não consegui descobrir a conta da Twilio'
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${providerRef}.json`,
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
