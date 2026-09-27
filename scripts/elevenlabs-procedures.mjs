#!/usr/bin/env node --experimental-strip-types
//
// Puts Telma's procedures on the agent, so the system prompt stops carrying
// them.
//
//   node scripts/elevenlabs-procedures.mjs                    say what it would do
//   node scripts/elevenlabs-procedures.mjs --push             write to a side branch
//   node scripts/elevenlabs-procedures.mjs --push --branch Main   write to the live one
//   node scripts/elevenlabs-procedures.mjs --prune            remove ours and stop
//
// ── WHY PROCEDURES AND NOT A BIGGER PROMPT ──────────────────────────────────
// ElevenLabs asks for a system prompt under two thousand tokens. Ours was at
// 7618 and is now at 4826, and the part of that which is true in every sentence
// of every call -- who she is, how she speaks, what she never does, the
// emergencies, the facts about this clinic -- is 2171 of it. The rest is four
// procedures that are each true only while you are doing them, and a procedure
// is exactly what the platform has for that: it carries a trigger, and it loads
// when the conversation matches it.
//
// e5a4f7e had already tried this as a node graph and measured that it barely
// helped, because the booking node was nearly as big as the sheet it came out
// of. That is what 10d971c fixed. This is the second half of the same move, and
// it only makes sense after it.
//
// ── WHY THEY CAN LIVE ON A SHARED AGENT ─────────────────────────────────────
// A procedure is agent configuration: it is the same for every call. The four
// pieces below qualify because nothing in them changes from clinic to clinic --
// no opening hour, no price, no caller id, no appointment length. That is not a
// hope, it is a test: "the procedures are the same for every clinic" in
// scripts/test-prompt.mjs builds the same base for six different clinics and
// asserts the four pieces come out identical. The day somebody writes an
// opening hour into the booking steps, that test fails and this script stops
// being possible, which is the point of it.
//
// ── WHY TEN AND NOT FIVE ────────────────────────────────────────────────────
// The base is written in the language the clinic greets in, and the agent is
// shared by Portuguese and Spanish clinics. A procedure holds one text, so each
// piece is pushed twice and the trigger names the language. Only one of each
// pair can ever match, so what loads is the same size either way.
//
// ── WHY IT DOES NOT WRITE TO MAIN BY DEFAULT ────────────────────────────────
// Main is answering the telephone. A branch is the platform's own way of
// preparing a change without serving it, so this makes one, pushes there, and
// leaves the live agent alone until somebody asks for --branch Main.

import { readFileSync } from 'node:fs'
import { buildPrompt } from '../lib/onboarding/prompt.ts'

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : null
}
const PUSH = args.includes('--push')
const PRUNE = args.includes('--prune')
const BRANCH_NAME = flag('branch') ?? 'procedures'

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local */
  }
  return null
}

const KEY = env('ELEVENLABS_API_KEY')
const AGENT = flag('agent') ?? env('ELEVENLABS_AGENT_ID')
if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')
if (!AGENT) fail('Falta --agent agent_xxx (ou ELEVENLABS_AGENT_ID).')

function fail(msg) {
  console.error(`\n  ${msg}\n`)
  process.exit(1)
}

const API = 'https://api.elevenlabs.io/v1/convai'
async function call(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) fail(`${method} ${path} -> ${r.status}\n  ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

// The clinic the pieces are cut from -------------------------------------------
// Any clinic would do, which is the whole argument: these four sections come out
// identical whatever is put in. This one is filled in so that `can_book` is true
// and the booking procedure is the one that can book.
const REFERENCE = {
  clinic_name: 'Clínica', specialty: null, address: null, phone: null,
  timezone: 'Europe/Lisbon', caller_id: null, veterinary: false, professionals: [],
  services: ['Consulta'], custom_services: null, opening_hours: [],
  appointment_duration_minutes: 30, languages: ['Português'], formality: 'formal',
  price_info: null, fallback_policy: 'message', fallback_number: null, briefing: null,
  can_book: true, within_opening_hours: true, emergency_number: null,
  emergency_protocol: null, recording: true, after_hours_transfer: false,
  after_hours_patients_only: false, after_hours_number: null, today: null,
}

// The triggers are in English on purpose. They are read by the model deciding
// what to load, not spoken to anybody, and the one thing they have to do
// reliably is tell a Portuguese call from a Spanish one.
const PIECES = [
  {
    node: 'booking',
    slug: 'marcacoes',
    trigger: {
      pt: 'The caller wants to make an appointment, or asks what times are free, in a conversation held in Portuguese.',
      es: 'The caller wants to make an appointment, or asks what times are free, in a conversation held in Spanish.',
    },
  },
  {
    node: 'cancelling',
    slug: 'cancelamentos',
    trigger: {
      pt: 'The caller wants to cancel or move an appointment they already have, in a conversation held in Portuguese.',
      es: 'The caller wants to cancel or move an appointment they already have, in a conversation held in Spanish.',
    },
  },
  {
    node: 'closing',
    slug: 'despedida',
    trigger: {
      pt: 'What the caller rang about has been dealt with and the call is ready to end, in a conversation held in Portuguese.',
      es: 'What the caller rang about has been dealt with and the call is ready to end, in a conversation held in Spanish.',
    },
  },
  {
    node: 'difficult',
    slug: 'dificil',
    trigger: {
      pt: 'The caller has gone quiet, has said they will leave it for another time, or is being abusive, in a conversation held in Portuguese.',
      es: 'The caller has gone quiet, has said they will leave it for another time, or is being abusive, in a conversation held in Spanish.',
    },
  },
]

// A name we can recognise later. --prune only removes procedures whose name
// starts with this, so a procedure somebody wrote by hand in the console is
// never touched by a script that did not create it.
const PREFIX = 'telma/'

const wanted = []
for (const lang of ['pt', 'es']) {
  const { nodes } = buildPrompt(REFERENCE, lang)
  for (const piece of PIECES) {
    wanted.push({
      name: `${PREFIX}${piece.slug}-${lang}`,
      type: 'free_form',
      trigger: piece.trigger[lang],
      content: nodes[piece.node],
    })
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

const { results: branches } = await call('GET', `/agents/${AGENT}/branches`)
let branch = branches.find((b) => b.name === BRANCH_NAME && !b.is_archived)

if (!branch) {
  if (!PUSH) {
    console.log(`\n  Branch "${BRANCH_NAME}" ainda não existe. Seria criada.`)
  } else {
    const main = branches.find((b) => b.name === 'Main') ?? branches[0]
    // The version to branch off, which is on the agent rather than on the
    // branch: there is no endpoint that lists a branch's versions.
    const { version_id } = await call('GET', `/agents/${AGENT}`)
    await call('POST', `/agents/${AGENT}/branches`, {
      name: BRANCH_NAME,
      description: 'Os procedimentos da Telma, fora do system prompt.',
      parent_branch_id: main?.id,
      parent_version_id: version_id,
    })
    // Read back rather than trust the reply: what comes out of the POST does
    // not carry the branch id under the name the listing uses for it.
    const after = await call('GET', `/agents/${AGENT}/branches`)
    branch = after.results.find((b) => b.name === BRANCH_NAME && !b.is_archived)
    if (!branch) fail(`Branch "${BRANCH_NAME}" criada mas não encontrada a seguir.`)
    console.log(`  Branch "${BRANCH_NAME}" criada: ${branch.id}`)
  }
}

const tok = (s) => Math.round(s.length / 3.4)

if (!PUSH) {
  console.log('\n  O que seria enviado (nada foi escrito):\n')
  for (const p of wanted) {
    console.log(`    ${p.name.padEnd(28)} ${String(tok(p.content)).padStart(5)} tok`)
  }
  const core = tok(buildPrompt(REFERENCE, 'pt').nodes.core)
  console.log(`\n    system prompt que ficaria: ~${core} tok mais os dados da clínica`)
  console.log(`    (ElevenLabs recomenda abaixo de 2000)\n`)
  console.log(`  Para escrever:  node scripts/elevenlabs-procedures.mjs --push\n`)
  process.exit(0)
}

const existing = (await call('GET', `/agents/${AGENT}/branches/${branch.id}/procedures`)).procedures

if (PRUNE) {
  for (const p of existing.filter((p) => p.name.startsWith(PREFIX))) {
    await call('DELETE', `/agents/${AGENT}/branches/${branch.id}/procedures/${p.procedure_id}`)
    console.log(`  - ${p.name}`)
  }
  console.log('\n  Apagados.\n')
  process.exit(0)
}

// Idempotent by name, like elevenlabs-wire-tools.mjs: running this twice leaves
// the same ten procedures, not twenty.
for (const p of wanted) {
  const found = existing.find((e) => e.name === p.name)
  const id =
    found?.procedure_id ??
    (await call('POST', `/agents/${AGENT}/branches/${branch.id}/procedures`, {})).procedure_id
  await call('PATCH', `/agents/${AGENT}/branches/${branch.id}/procedures/${id}/draft`, p)
  console.log(`  ${found ? '~' : '+'} ${p.name.padEnd(28)} ${String(tok(p.content)).padStart(5)} tok`)
}

console.log(`\n  Na branch "${branch.name ?? BRANCH_NAME}". Ficam em rascunho até serem publicadas na consola.\n`)
