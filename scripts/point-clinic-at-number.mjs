#!/usr/bin/env node
//
// Aponta uma clínica para o número que vai atender.
//
//   node scripts/point-clinic-at-number.mjs --clinic <uuid> --number +34600111222
//   node scripts/point-clinic-at-number.mjs --number +34600111222        (única clínica)
//   node scripts/point-clinic-at-number.mjs --list
//
// ── PORQUE É QUE ISTO EXISTE ────────────────────────────────────────────────
// /api/voice/init descobre de que clínica se trata pelo número que foi marcado,
// e por mais nenhum caminho: adivinhar seria uma clínica a atender pela outra.
// Enquanto a coluna `assigned_phone_digits` não for exactamente o número que a
// Twilio entrega, o init responde 404, a ElevenLabs cai em silêncio para o
// prompt de emergência colado no agente, e a chamada corre com uma Telma que
// não sabe onde trabalha. Sem erro nenhum à vista.
//
// Este script fecha essa ligação e verifica que ficou fechada.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : null
}

const env = (n) => {
  if (process.env[n]) return process.env[n].trim()
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^\\s*${n}\\s*=\\s*(.+)\\s*$`))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const URL_ = env('NEXT_PUBLIC_SUPABASE_URL')
const SR = env('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !SR) {
  console.error('\n  Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.\n')
  process.exit(1)
}

const rest = async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

const clinics = await rest(
  'clinics?select=id,name,status,timezone,assigned_phone,assigned_phone_digits&order=created_at'
)

if (args.includes('--list') || !flag('number')) {
  console.log(`\n  ${clinics.length} clínica(s):\n`)
  for (const c of clinics) {
    console.log(`  ${c.id}`)
    console.log(`    ${c.name}  (${c.status}, ${c.timezone})`)
    console.log(`    número: ${c.assigned_phone ?? '(nenhum)'}  digits: ${c.assigned_phone_digits ?? '-'}\n`)
  }
  if (!flag('number')) console.log('  Passe --number +34... para apontar uma delas.\n')
  process.exit(0)
}

const raw = flag('number')
// E.164 a sério: a Twilio entrega sempre com +, e os dígitos são o que a coluna
// guarda, sem espaços nem sinais, porque é assim que o init compara.
if (!/^\+\d{8,15}$/.test(raw)) {
  console.error(`\n  "${raw}" não é E.164. Escreva-o como +34600111222.\n`)
  process.exit(1)
}
const digits = raw.slice(1)

const wanted = flag('clinic')
const clinic = wanted
  ? clinics.find((c) => c.id === wanted)
  : clinics.length === 1
    ? clinics[0]
    : null

if (!clinic) {
  console.error(
    wanted
      ? `\n  Não há clínica com id ${wanted}.\n`
      : `\n  Há ${clinics.length} clínicas. Diga qual, com --clinic <uuid>. Use --list para as ver.\n`
  )
  process.exit(1)
}

// Duas clínicas com o mesmo número seria a fuga de dados que o init existe para
// evitar, e a base de dados não o impede sozinha. Verifica-se aqui.
const clash = clinics.find((c) => c.assigned_phone_digits === digits && c.id !== clinic.id)
if (clash) {
  console.error(`\n  ${digits} já está em "${clash.name}". Duas clínicas no mesmo número, não.\n`)
  process.exit(1)
}

await rest(`clinics?id=eq.${clinic.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ assigned_phone: raw, assigned_phone_digits: digits }),
})
console.log(`\n  "${clinic.name}" atende agora em ${raw}`)

// Verificar é o ponto: a escrita acima podia ter corrido bem e o init continuar
// a não encontrar a clínica, e isso só se vê a perguntar-lhe.
const base = flag('base') ?? env('TELMA_PUBLIC_BASE_URL')
if (!base) {
  console.log('\n  Passe --base https://... para eu confirmar que o init já a encontra.\n')
  process.exit(0)
}

const res = await fetch(`${base.replace(/\/$/, '')}/api/voice/init`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ called_number: raw, caller_id: '+34600000000' }),
})
const body = await res.json().catch(() => null)

if (!res.ok || !body?.conversation_config_override) {
  console.log(`\n  MAS o init responde ${res.status}: ${JSON.stringify(body).slice(0, 200)}`)
  console.log('  Enquanto isto não devolver 200, a chamada corre com o prompt de emergência.\n')
  process.exit(1)
}

const o = body.conversation_config_override
console.log(`  o init encontra-a: ${body.dynamic_variables.clinic_name}`)
console.log(`  língua ${o.agent.language}, voz ${o.tts.voice_id}, prompt ${o.agent.prompt.prompt.length} chars`)
console.log(`  atende com: "${o.agent.first_message}"\n`)
