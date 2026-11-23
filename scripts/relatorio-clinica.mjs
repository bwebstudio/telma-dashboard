#!/usr/bin/env node
//
// Como está a correr uma clínica: minutos, chamadas, e o que correu mal.
//
//   node scripts/relatorio-clinica.mjs                    a Ímpar
//   node scripts/relatorio-clinica.mjs --clinica <id>     outra
//   node scripts/relatorio-clinica.mjs --dias 7           só a última semana
//
// ── PORQUE É QUE ISTO É UM SCRIPT E NÃO UMA TAREFA AGENDADA ─────────────────
// Agendar isto na nuvem não dá: as chaves da base de dados e da plataforma de
// voz vivem no .env.local desta máquina e não saem daqui, que é a regra desta
// casa. Uma sessão na nuvem arranca sem elas e não consegue perguntar nada.
//
// Então fica o contrário: a pergunta inteira numa linha de comando, para que
// rever a clínica daqui a uns dias seja correr isto e ler, em vez de voltar a
// montar as mesmas consultas de cada vez.
//
// O que mede, e porquê cada coisa:
//   - minutos do período de faturação a sério, não do mês do calendário, e
//     somados das chamadas, que é a coluna que a plataforma corrige
//   - quantas chamadas deixaram recado e quantas desligaram a ouvir a Telma,
//     que é a diferença entre um serviço que serve e um que ninguém usa
//   - o que precisa de atenção: chamadas longas de mais, vermelhos no painel,
//     resumos em inglês, e recados sem contacto para devolver a chamada

import { readFileSync } from 'node:fs'
import { billingPeriod } from '../lib/usage-period.ts'

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : null
}
const CLINICA = flag('clinica') ?? '77afb01b-d8be-460c-98d3-b982856a1dcb'
const DIAS = Number(flag('dias') ?? 14)

const env = (n) => {
  if (process.env[n]) return process.env[n].trim()
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^\\s*${n}\\s*=\\s*(.+)\\s*$`))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const BASE = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
if (!BASE || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const db = async (path) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const dia = (s) => String(s).slice(0, 10)
const hhmm = (s) => String(s).slice(11, 16)
const min = (segundos) => Math.round((segundos / 60) * 10) / 10
// Os números com que testámos, para não os confundir com pacientes.
const NOSSOS = new Set(['914884878', '914512437', '910523903', '912000111', '963773828', '613071545'])

const clinica = (await db(`clinics?select=*&id=eq.${CLINICA}`))[0]
if (!clinica) {
  console.error('Não há clínica com esse id.')
  process.exit(1)
}

const periodo = billingPeriod(clinica)
const chamadas = await db(
  `calls?select=created_at,result,duration_seconds,summary,patient_name,from_digits,handled_at` +
    `&clinic_id=eq.${CLINICA}&order=created_at`
)

const noPeriodo = chamadas.filter((c) => {
  const at = new Date(c.created_at)
  return at >= periodo.start && at < periodo.end
})
const segundos = noPeriodo.reduce((s, c) => s + (Number(c.duration_seconds) || 0), 0)
const limite = Number(clinica.minute_limit) || 0
const usados = min(segundos)

console.log(`\n  ${clinica.name}  ·  ${clinica.status}  ·  plano ${clinica.plan}`)
console.log(`  ${'─'.repeat(64)}`)
console.log(`  Período de faturação: ${dia(periodo.start.toISOString())} a ${dia(periodo.end.toISOString())}` +
  (periodo.fromSubscription ? '' : '  (mês do calendário: não há subscrição)'))
console.log(`  Minutos: ${usados} de ${limite}  (${limite ? Math.round((usados / limite) * 100) : 0}%)`)
console.log(`  Chamadas no período: ${noPeriodo.length}`)

// ── O DIA A DIA ────────────────────────────────────────────────────────────
const limiteDias = new Date(Date.now() - DIAS * 24 * 3600 * 1000)
const recentes = chamadas.filter((c) => new Date(c.created_at) >= limiteDias)
const porDia = new Map()
for (const c of recentes) {
  const d = dia(c.created_at)
  const e = porDia.get(d) ?? { n: 0, seg: 0, recado: 0 }
  e.n += 1
  e.seg += Number(c.duration_seconds) || 0
  if (!String(c.summary ?? '').includes('não deixou recado')) e.recado += 1
  porDia.set(d, e)
}
console.log(`\n  Últimos ${DIAS} dias`)
console.log(`  ${'─'.repeat(64)}`)
if (!porDia.size) console.log('  Nenhuma chamada.')
for (const [d, e] of [...porDia].sort()) {
  console.log(`  ${d}  ${String(e.n).padStart(2)} chamadas  ${String(min(e.seg)).padStart(5)} min  ${e.recado} com recado`)
}

// ── QUEM FALOU E QUEM DESLIGOU ─────────────────────────────────────────────
const pacientes = recentes.filter((c) => !NOSSOS.has(c.from_digits ?? ''))
const comRecado = pacientes.filter((c) => !String(c.summary ?? '').includes('não deixou recado'))
const curtas = pacientes.filter((c) => (Number(c.duration_seconds) || 0) <= 15)
console.log(`\n  Pacientes nos últimos ${DIAS} dias (sem os nossos números de teste)`)
console.log(`  ${'─'.repeat(64)}`)
if (pacientes.length) {
  const pct = (n) => Math.round((n / pacientes.length) * 100)
  console.log(`  ${pacientes.length} chamadas  ·  média ${Math.round(
    pacientes.reduce((s, c) => s + (Number(c.duration_seconds) || 0), 0) / pacientes.length
  )}s`)
  console.log(`  Deixaram recado: ${comRecado.length} (${pct(comRecado.length)}%)`)
  console.log(`  Desligaram até aos 15 segundos: ${curtas.length} (${pct(curtas.length)}%)`)
} else {
  console.log('  Nenhuma.')
}

// ── O QUE PRECISA DE ATENÇÃO ───────────────────────────────────────────────
const avisos = []
const longas = noPeriodo.filter((c) => (Number(c.duration_seconds) || 0) >= 180)
if (longas.length)
  avisos.push(
    `${longas.length} chamada(s) de três minutos ou mais: ` +
      longas.map((c) => `${dia(c.created_at)} ${hhmm(c.created_at)} (${c.duration_seconds}s)`).join(', ')
  )
const vermelhos = noPeriodo.filter((c) => c.result === 'nao_resolvida')
if (vermelhos.length) avisos.push(`${vermelhos.length} chamada(s) a vermelho no painel`)
const ingles = chamadas.filter((c) => /\b(the|agent|user|appointment)\b/i.test(c.summary ?? ''))
if (ingles.length) avisos.push(`${ingles.length} resumo(s) em inglês`)
const semContacto = noPeriodo.filter(
  (c) => ['urgencia', 'pedido_marcacao', 'pedido_cancelamento'].includes(c.result) && !c.from_digits
)
if (semContacto.length) avisos.push(`${semContacto.length} recado(s) sem número para devolver a chamada`)
const porTratar = noPeriodo.filter(
  (c) => !c.handled_at && !String(c.summary ?? '').includes('não deixou recado')
)
if (porTratar.length) avisos.push(`${porTratar.length} recado(s) por marcar como tratado`)

console.log(`\n  A olhar`)
console.log(`  ${'─'.repeat(64)}`)
if (!avisos.length) console.log('  Nada.')
for (const a of avisos) console.log(`  · ${a}`)

// ── E OS RECADOS A SÉRIO, PARA SE PODER LER ────────────────────────────────
console.log(`\n  Recados dos últimos ${DIAS} dias`)
console.log(`  ${'─'.repeat(64)}`)
const lista = recentes.filter((c) => !String(c.summary ?? '').includes('não deixou recado'))
if (!lista.length) console.log('  Nenhum.')
for (const c of lista) {
  console.log(
    `  ${dia(c.created_at)} ${hhmm(c.created_at)}  ${(c.result ?? '-').padEnd(20)}${c.patient_name ?? ''}`
  )
  console.log(`      ${String(c.summary ?? '').replace(/\n+/g, ' ').slice(0, 110)}`)
}
console.log()
