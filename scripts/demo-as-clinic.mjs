#!/usr/bin/env node
//
// A demo que atende como um cliente verdadeiro, para se poder ligar e ouvir.
//
//   node scripts/demo-as-clinic.mjs --as <id da clínica>   copia a configuração
//   node scripts/demo-as-clinic.mjs --restore              devolve a demo
//   node scripts/demo-as-clinic.mjs --show                 diz como está agora
//   node scripts/demo-as-clinic.mjs --limpar-dia [data]    apaga as chamadas desse dia
//
// ── PORQUE É QUE APAGAR O DIA ESTÁ AQUI ────────────────────────────────────
// Entre duas rondas de ensaio quer-se o ecrã vazio, para que as chamadas
// seguintes se leiam sem as anteriores à volta. Isso não tem nada que ver com
// despir a demo, e estava a uma palavra de distância: `--restore`, que a
// despe. Quem queria limpar o dia devolveu a clínica ao que era e teve de
// voltar a vesti-la. Dois trabalhos diferentes, dois comandos.
//
// ── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
// Uma clínica entra em funcionamento num dia marcado, e na véspera a única
// pergunta que importa é esta: se eu ligar agora, o que é que a pessoa do
// outro lado ouve? Lê-se a configuração no painel e imagina-se; ou liga-se à
// linha do cliente, que ainda não é nossa para andar a experimentar e cujos
// minutos são dele.
//
// A demo já atende. O que lhe faltava era atender *como eles*: com o nome
// deles, o horário deles, os serviços e os preços deles, e o acolhimento que
// escreveram. O prompt é construído a cada chamada a partir da linha da
// clínica (ver app/api/voice/init), por isso copiar os campos certos para a
// demo é copiar a conversa inteira. Liga-se, ouve-se, e corrige-se antes de
// ser um paciente a descobrir.
//
// ── O QUE COPIA E O QUE NÃO COPIA ──────────────────────────────────────────
// Copia tudo aquilo que a Telma lê ou diz: nome, morada, telefone, serviços,
// preços, durações, horário, acolhimento, briefing, protocolo de urgência,
// especialidade, idiomas, tratamento, fuso, política de fallback, horas extra
// e se marca ou só toma recados.
//
// Não copia nada que seja do cliente e não da conversa: a subscrição e o
// cliente no Stripe, o plano, os minutos, os termos aceites, o estado, o
// número portado, a conta de email. Tocar nisso seria faturar a demo ao
// cliente, ou pior, mexer numa coisa que é dele.
//
// ── E DESFAZ-SE ────────────────────────────────────────────────────────────
// Antes de escrever, guarda a demo inteira numa linha de `clinic_snapshots`
// com a data. `--restore` lê a última e repõe tudo, horário incluído. Sem
// isso, uma demo "temporária" fica assim para sempre porque ninguém se lembra
// de como estava.

import { readFileSync } from 'node:fs'

const DEMO = '11111111-1111-1111-1111-111111111111'

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

/**
 * Os campos que a conversa lê.
 *
 * Escritos um a um, e não com um "tudo menos estes", porque a lista de
 * exclusões é a que envelhece mal: uma coluna nova aparece na tabela e passa a
 * ser copiada sem que ninguém o tenha decidido. Uma coluna nova aqui não faz
 * nada até alguém a escrever nesta lista.
 */
const SPOKEN = [
  'name',
  'specialty',
  'address',
  'phone',
  'region',
  'greeting',
  'briefing',
  'price_info',
  'services',
  'custom_services',
  'service_prices',
  'service_durations',
  'formality',
  'selected_languages',
  'timezone',
  'fallback_policy',
  'fallback_number',
  'emergency_number',
  'emergency_protocol',
  'after_hours_transfer',
  'after_hours_patients_only',
  'after_hours_number',
  'takes_bookings',
  'appointments_auto_confirmed',
  'appointment_duration_minutes',
  'slot_minutes',
  'calls_recorded',
]

const args = process.argv.slice(2)
const as = args[args.indexOf('--as') + 1]
const wantRestore = args.includes('--restore')
const wantShow = args.includes('--show')
const clearAt = args.indexOf('--limpar-dia')
const wantClear = clearAt !== -1
const clearDay = wantClear && args[clearAt + 1]?.startsWith('20') ? args[clearAt + 1] : null

const hoursOf = (id) =>
  rest(`availability_slots?clinic_id=eq.${id}&select=weekday,start_time,end_time,resource_id&order=weekday,start_time`)

async function show() {
  const [demo] = await rest(`clinics?id=eq.${DEMO}&select=name,takes_bookings,greeting`)
  const hours = await hoursOf(DEMO)
  const snaps = await rest(
    `clinic_snapshots?clinic_id=eq.${DEMO}&select=taken_at,note&order=taken_at.desc&limit=3`
  ).catch(() => [])
  console.log(`\n  A demo atende como: ${demo.name}`)
  console.log(`  Marcações: ${demo.takes_bookings ? 'sim' : 'só recados'}`)
  console.log(`  Acolhimento próprio: ${demo.greeting ? 'sim' : 'não'}`)
  console.log(`  Horário: ${hours.map((h) => `${h.weekday}:${h.start_time.slice(0, 5)}-${h.end_time.slice(0, 5)}`).join(' ')}`)
  if (snaps.length) {
    console.log('\n  Cópias guardadas:')
    for (const s of snaps) console.log(`   ${s.taken_at.slice(0, 19)}  ${s.note ?? ''}`)
  }
  console.log()
}

/**
 * Apagar as chamadas de um dia na demo, e só na demo.
 *
 * O contador de minutos não desanda sozinho quando se apaga uma chamada: é um
 * medidor que o webhook vai somando, e apagar a linha não lhe toca. Um painel
 * de demonstração com o dia vazio e dezassete minutos gastos levanta a
 * pergunta errada no meio de uma demonstração, por isso recalcula-se a partir
 * do que sobrou.
 */
async function clearDayCalls(day) {
  const [clinic] = await rest(`clinics?id=eq.${DEMO}&select=timezone`)
  const tz = clinic?.timezone ?? 'Europe/Lisbon'
  const date =
    day ??
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' }).format(new Date())

  // O dia inteiro na hora da clínica, convertido para o instante que a base
  // guarda. Sem isto, apagar "hoje" às 00:30 em Lisboa apagaria ontem.
  const offset = (() => {
    const d = new Date(`${date}T12:00:00Z`)
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, hour: '2-digit',
    }).format(d)
    return Number(local) - 12
  })()
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const zone = `${offset >= 0 ? '+' : '-'}${pad(offset)}:00`
  const from = `${date}T00:00:00${zone}`
  const to = `${date}T23:59:59${zone}`

  const doomed = await rest(
    `calls?clinic_id=eq.${DEMO}&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&select=id`
  )
  if (!doomed.length) {
    console.log(`\n  Não há chamadas em ${date}. Nada para apagar.\n`)
    return
  }
  await rest(
    `calls?clinic_id=eq.${DEMO}&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}`,
    { method: 'DELETE' }
  )

  const month = `${date.slice(0, 7)}-01`
  const left = await rest(
    `calls?clinic_id=eq.${DEMO}&created_at=gte.${month}&select=duration_seconds`
  )
  const minutes = left.reduce((t, c) => t + (c.duration_seconds ?? 0), 0) / 60
  await rest(`usage?clinic_id=eq.${DEMO}&month=eq.${month}`, {
    method: 'PATCH',
    body: JSON.stringify({ calls_count: left.length, minutes: Number(minutes.toFixed(2)) }),
  })

  console.log(`\n  ${doomed.length} chamadas de ${date} apagadas.`)
  console.log(`  O mês fica em ${left.length} chamadas e ${minutes.toFixed(2)} minutos.\n`)
}

async function snapshot(note) {
  const [demo] = await rest(`clinics?id=eq.${DEMO}&select=*`)
  const hours = await hoursOf(DEMO)
  await rest('clinic_snapshots', {
    method: 'POST',
    body: JSON.stringify({ clinic_id: DEMO, note, clinic: demo, hours }),
  })
  console.log(`  cópia guardada (${note})`)
}

async function apply(sourceId) {
  const [src] = await rest(`clinics?id=eq.${sourceId}&select=*`)
  if (!src) throw new Error(`não há clínica ${sourceId}`)

  await snapshot(`antes de copiar ${src.name}`)

  const patch = Object.fromEntries(SPOKEN.map((k) => [k, src[k] ?? null]))
  await rest(`clinics?id=eq.${DEMO}`, { method: 'PATCH', body: JSON.stringify(patch) })

  // O horário vive noutra tabela e é metade do que a Telma diz: "estamos
  // fechados, abrimos às oito" sai daqui e de mais lado nenhum.
  const [room] = await rest(`resources?clinic_id=eq.${DEMO}&select=id&order=sort&limit=1`)
  const hours = await hoursOf(sourceId)
  await rest(`availability_slots?clinic_id=eq.${DEMO}`, { method: 'DELETE' })
  if (hours.length && room) {
    await rest('availability_slots', {
      method: 'POST',
      body: JSON.stringify(
        hours.map((h) => ({
          clinic_id: DEMO,
          resource_id: room.id,
          weekday: h.weekday,
          start_time: h.start_time,
          end_time: h.end_time,
        }))
      ),
    })
  }

  console.log(`\n  A demo atende agora como ${src.name}.`)
  console.log(`  ${hours.length} faixas de horário copiadas.`)
  console.log(`  Para desfazer: node scripts/demo-as-clinic.mjs --restore\n`)
}

async function restore() {
  const [snap] = await rest(
    `clinic_snapshots?clinic_id=eq.${DEMO}&select=*&order=taken_at.desc&limit=1`
  )
  if (!snap) throw new Error('não há nenhuma cópia guardada')

  const patch = Object.fromEntries(SPOKEN.map((k) => [k, snap.clinic[k] ?? null]))
  await rest(`clinics?id=eq.${DEMO}`, { method: 'PATCH', body: JSON.stringify(patch) })

  const [room] = await rest(`resources?clinic_id=eq.${DEMO}&select=id&order=sort&limit=1`)
  await rest(`availability_slots?clinic_id=eq.${DEMO}`, { method: 'DELETE' })
  if (snap.hours?.length && room) {
    await rest('availability_slots', {
      method: 'POST',
      body: JSON.stringify(
        snap.hours.map((h) => ({
          clinic_id: DEMO,
          resource_id: room.id,
          weekday: h.weekday,
          start_time: h.start_time,
          end_time: h.end_time,
        }))
      ),
    })
  }
  await rest(`clinic_snapshots?id=eq.${snap.id}`, { method: 'DELETE' })
  console.log(`\n  A demo voltou a ser ${snap.clinic.name} (cópia de ${snap.taken_at.slice(0, 19)}).\n`)
}

try {
  if (wantShow) await show()
  else if (wantClear) await clearDayCalls(clearDay)
  else if (wantRestore) await restore()
  else if (as) await apply(as)
  else {
    console.log(`
  node scripts/demo-as-clinic.mjs --as <id>   a demo passa a atender como essa clínica
  node scripts/demo-as-clinic.mjs --restore   volta a ser a demo
  node scripts/demo-as-clinic.mjs --show      como está agora

  node scripts/demo-as-clinic.mjs --limpar-dia           apaga as chamadas de hoje
  node scripts/demo-as-clinic.mjs --limpar-dia 2026-10-25  apaga as desse dia
`)
  }
} catch (e) {
  console.error(`\n  ${e.message}\n`)
  process.exit(1)
}
