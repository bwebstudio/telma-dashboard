#!/usr/bin/env node
//
// O que está mesmo na base de dados, e como tirar de lá o que sobrou.
//
//   node scripts/clinics.mjs                          lista tudo
//   node scripts/clinics.mjs --delete <id> [<id>...]  apaga essas
//   node scripts/clinics.mjs --delete-all-except <id> apaga as outras todas
//   node scripts/clinics.mjs --delete ... --yes       sem confirmar
//
// ── PORQUE É QUE ISTO NÃO APAGA À PRIMEIRA ──────────────────────────────────
// Apagar uma clínica leva com ela as marcações, as chamadas, os horários e as
// contas de quem lá trabalha. É a operação mais destrutiva que existe aqui, e a
// lista onde se escolhe o que apagar já tem um cliente verdadeiro lá dentro.
//
// Por isso: sem argumentos só lê; com --delete diz primeiro o que vai levar e
// espera cinco segundos antes de o fazer.
//
// ── E PORQUE É QUE APAGA TAMBÉM AS CONTAS ───────────────────────────────────
// A clínica leva em cascata as suas linhas, mas a conta de autenticação vive no
// schema da Supabase e não vem atrás. Uma conta órfã bloqueia esse email para
// sempre: quem tentar inscrever-se outra vez com ele recebe "já existe" e não há
// nada no painel que explique porquê.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const YES = args.includes('--yes')

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
  console.error('\n  Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local.\n')
  process.exit(1)
}

const rest = async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160)}`)
  return text ? JSON.parse(text) : null
}

const auth = async (path, init = {}) => {
  const r = await fetch(`${URL_}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160)}`)
  return text ? JSON.parse(text) : null
}

// Ler ---------------------------------------------------------------------

const clinics = await rest(
  'clinics?select=id,name,status,plan,created_at,assigned_phone,region,timezone&order=created_at'
)

// Contar o que cada uma leva atrás, para que a decisão seja tomada com o número
// à frente e não com o nome apenas.
const counts = {}
for (const table of ['appointments', 'calls', 'availability_slots', 'users']) {
  for (const c of clinics) {
    const rows = await rest(`${table}?clinic_id=eq.${c.id}&select=id`)
    counts[c.id] ??= {}
    counts[c.id][table] = rows.length
  }
}

console.log(`\n  ${clinics.length} clínica(s) em ${URL_.replace(/^https:\/\//, '').split('.')[0]}\n`)
for (const c of clinics) {
  const n = counts[c.id]
  const when = new Date(c.created_at).toISOString().slice(0, 16).replace('T', ' ')
  console.log(`  ${c.id}`)
  console.log(`    ${c.name}`)
  console.log(`    ${c.status} · ${c.plan ?? 'sem plano'} · ${c.region ?? '-'} · criada ${when}`)
  console.log(`    telefone ${c.assigned_phone ?? '-'}`)
  console.log(
    `    ${n.appointments} marcações · ${n.calls} chamadas · ${n.availability_slots} horários · ${n.users} contas\n`
  )
}

// Contas de autenticação que já não pertencem a ninguém.
let orphans = []
try {
  const { users = [] } = (await auth('admin/users?per_page=200')) ?? {}
  const rows = await rest('users?select=id,email,clinic_id')
  const known = new Set(rows.map((r) => r.id))
  orphans = users.filter((u) => !known.has(u.id))
  if (orphans.length) {
    console.log(`  ${orphans.length} conta(s) de autenticação sem clínica, que bloqueiam esses emails:`)
    for (const o of orphans) console.log(`    ${o.email}  ${o.id}`)
    console.log('')
  }
} catch (e) {
  console.log(`  (não consegui ler as contas de autenticação: ${e.message})\n`)
}

// Apagar ------------------------------------------------------------------

const iDelete = args.indexOf('--delete')
const iExcept = args.indexOf('--delete-all-except')

let targets = []
if (iDelete >= 0) {
  targets = args.slice(iDelete + 1).filter((a) => !a.startsWith('--'))
} else if (iExcept >= 0) {
  const keep = new Set(args.slice(iExcept + 1).filter((a) => !a.startsWith('--')))
  if (!keep.size) {
    console.error('  --delete-all-except precisa de pelo menos um id para manter.\n')
    process.exit(1)
  }
  targets = clinics.filter((c) => !keep.has(c.id)).map((c) => c.id)
}

if (!targets.length) {
  console.log('  Nada apagado. Para apagar:')
  console.log('    node scripts/clinics.mjs --delete <id>')
  console.log('    node scripts/clinics.mjs --delete-all-except <id-que-fica>\n')
  process.exit(0)
}

const unknown = targets.filter((id) => !clinics.some((c) => c.id === id))
if (unknown.length) {
  console.error(`\n  Estes ids não existem: ${unknown.join(', ')}\n`)
  process.exit(1)
}

console.log('  VAI APAGAR, e com elas tudo o que está listado acima:\n')
for (const id of targets) {
  const c = clinics.find((x) => x.id === id)
  const n = counts[id]
  console.log(`    ${c.name}  (${n.appointments} marcações, ${n.calls} chamadas, ${n.users} contas)`)
}

if (!YES) {
  console.log('\n  Cinco segundos para interromper com Ctrl-C.\n')
  await new Promise((r) => setTimeout(r, 5000))
}

for (const id of targets) {
  const c = clinics.find((x) => x.id === id)
  // As contas primeiro: se a clínica desaparecer antes, deixa de haver forma de
  // saber quais eram, e ficam a bloquear esses emails para sempre.
  const users = await rest(`users?clinic_id=eq.${id}&select=id,email`)
  for (const u of users) {
    try {
      await auth(`admin/users/${u.id}`, { method: 'DELETE' })
      console.log(`    conta apagada   ${u.email}`)
    } catch (e) {
      console.log(`    conta NÃO apagada ${u.email}: ${e.message}`)
    }
  }
  await rest(`clinics?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  console.log(`  apagada  ${c.name}\n`)
}

const left = await rest('clinics?select=id')
console.log(`  Ficam ${left.length} clínica(s).\n`)
