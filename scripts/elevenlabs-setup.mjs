#!/usr/bin/env node
//
// Reads the ElevenLabs account and prints what belongs in .env.local.
//
//   node scripts/elevenlabs-setup.mjs
//
// It writes nothing and changes nothing. It exists because the two ids the
// sign-up needs (the agent per language) are only visible in the dashboard, and
// copying them out of a URL bar is how one of them ends up with a trailing
// space. It also lists the voices, so you can see what step 4 will offer a
// clinic before a clinic sees it.
//
// Reads ELEVENLABS_API_KEY from the environment or from .env.local.

import { readFileSync } from 'node:fs'

function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)\s*$/)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local, which is fine if the variable is exported */
  }
  return null
}

const KEY = loadKey()
if (!KEY) {
  console.error('ELEVENLABS_API_KEY não encontrada (nem no ambiente nem em .env.local).')
  process.exit(1)
}

async function get(path) {
  const res = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    headers: { 'xi-api-key': KEY },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${path} → ${res.status}. ${body.slice(0, 200)}`)
  }
  return res.json()
}

const label = (s, n) => String(s).padEnd(n)

try {
  console.log('\n── AGENTES ' + '─'.repeat(50))
  try {
    const { agents = [] } = await get('/convai/agents')
    if (!agents.length) console.log('  (nenhum)')
    for (const a of agents) console.log(`  ${label(a.name, 34)} ${a.agent_id}`)

    console.log(
      '\n  Escolha UM e ponha-o em .env.local:\n' +
        '    ELEVENLABS_AGENT_ID=<id acima>\n\n' +
        '  Um só agente, para toda a gente. O que distingue uma clínica dentária\n' +
        '  de uma empresa de construção não é o agente: é o que /api/clinic-context\n' +
        '  lhe devolve no início de cada chamada (o que vende, em que língua, a que\n' +
        '  horas abre). Um agente por especialidade parte no primeiro cliente que\n' +
        '  não é uma das especialidades em que alguém pensou.'
    )
  } catch (e) {
    console.log(`  não foi possível ler: ${e.message}`)
    console.log('  (a chave precisa do scope ElevenAgents: Read)')
  }

  console.log('\n── VOZES ' + '─'.repeat(52))
  const { voices = [] } = await get('/voices')
  console.log(`  ${voices.length} vozes na conta\n`)
  for (const v of voices) {
    const langs = new Set()
    for (const l of v.verified_languages ?? []) if (l?.language) langs.add(l.language.slice(0, 2))
    if (v.labels?.language) langs.add(String(v.labels.language).slice(0, 2))
    const tag = langs.size ? [...langs].join(',') : '·'
    console.log(`  ${label(v.name, 24)} ${label(tag, 8)} ${v.voice_id}${v.preview_url ? '' : '   (sem amostra)'}`)
  }

  const withEs = voices.filter((v) =>
    (v.verified_languages ?? []).some((l) => l?.language?.startsWith('es'))
  ).length
  const withPt = voices.filter((v) =>
    (v.verified_languages ?? []).some((l) => l?.language?.startsWith('pt'))
  ).length
  console.log(`\n  verificadas em espanhol: ${withEs} · em português: ${withPt}`)

  // One voice per language, and the accent is the point. A clinic in Lisbon
  // whose receptionist sounds Brazilian, or one in Barcelona whose receptionist
  // sounds Mexican, has a receptionist its patients hear as foreign.
  const WANTED = [
    { code: 'PT', label: 'Português de Portugal', lang: 'pt', ok: (a, l) => a === 'european' || l === 'pt-PT' },
    { code: 'ES', label: 'Espanhol peninsular',   lang: 'es', ok: (a, l) => a.includes('peninsular') },
    { code: 'EN', label: 'Inglês americano',      lang: 'en', ok: (a, l) => a === 'american' || l === 'en-US' },
  ]

  console.log('\n── AS VOZES, UMA POR IDIOMA ' + '─'.repeat(34))
  console.log('  A voz segue o idioma em que a clínica atende, e fica fixa: a Telma')
  console.log('  nunca muda de voz a meio de uma chamada.\n')

  for (const w of WANTED) {
    const matches = []
    for (const v of voices) {
      for (const l of v.verified_languages ?? []) {
        if (!(l.language || '').startsWith(w.lang)) continue
        const accent = (l.accent || '').toLowerCase()
        const locale = l.locale || ''
        if (w.ok(accent, locale) && !matches.find((m) => m.voice_id === v.voice_id)) {
          matches.push({ voice_id: v.voice_id, name: v.name, accent, locale })
        }
      }
    }

    console.log(`  ${w.label}  (${matches.length} ${matches.length === 1 ? 'voz' : 'vozes'})`)
    if (!matches.length) {
      console.log('    nenhuma na conta com esse acento')
    }
    for (const m of matches) {
      console.log(`    ELEVENLABS_VOICE_ID_${w.code}=${m.voice_id}   # ${m.name} · ${m.accent} · ${m.locale}`)
    }
    console.log()
  }

  console.log('  Catalão: nenhuma voz do catálogo o declara. Sem ELEVENLABS_VOICE_ID_CA')
  console.log('  usa a espanhola, que é o mais próximo que existe.\n')

} catch (e) {
  console.error(`\nFalhou: ${e.message}`)
  console.error('Se for 401, a chave está errada. Se for 403, falta-lhe um scope.\n')
  process.exit(1)
}
