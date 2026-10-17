#!/usr/bin/env node
//
// Seven ways the same conversation can arrive, and one charge at the end.
//
//   npm run dev            (in another terminal)
//   npm run test:idempotency
//
// Not in `npm test`: this one needs a server and a database, and it writes.
// Everything it writes it takes back, including the minutes, and it uses the
// clinic that exists for testing. Nothing here touches a patient or sends a
// message.
//
// What it is watching, from the two holes that were found in the webhook:
// two deliveries arriving together used to bill the conversation twice, and a
// correction arriving later used to leave the minutes at whatever the first,
// shorter delivery had guessed. The first is closed by a unique index, the
// second by usage moving on the difference. See migration 0056.
import { readFileSync } from 'node:fs'
const env = (n) => { for (const l of readFileSync('/Users/rominasanchezpomier/Desktop/Proyectos/telmaatende/dashboard/.env.local','utf8').split('\n')) { const m=l.match(new RegExp(`^\\s*${n}\\s*=\\s*(.+)\\s*$`)); if (m) return m[1].trim().replace(/^["']|["']$/g,'') } }
const SUPA = env('NEXT_PUBLIC_SUPABASE_URL'), SRK = env('SUPABASE_SERVICE_ROLE_KEY'), TOKEN = env('TELMA_WEBHOOK_TOKEN')
const CLINIC = '179f718f-fd00-4eee-a123-314ae0f41fc1'
const BASE = 'http://localhost:3000'
const stamp = Date.now()
const sb = (p, i={}) => fetch(`${SUPA}/rest/v1/${p}`, { ...i, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type':'application/json', ...(i.headers||{}) } })
const j = async (r) => r.json().catch(() => null)

const post = (ref, seconds) => fetch(`${BASE}/api/webhook/call`, {
  method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ clinic_id: CLINIC, from_phone: '+351910000009', duration_seconds: seconds,
    result: 'informacao', summary: `idempotencia ${stamp}`, call_ref: ref }),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))

const month = new Date().toISOString().slice(0, 7) + '-01'
const usage = async () => {
  const r = await j(await sb(`usage?select=calls_count,minutes&clinic_id=eq.${CLINIC}&month=eq.${month}`))
  return r?.[0] ?? { calls_count: 0, minutes: 0 }
}
const rows = async (ref) => (await j(await sb(`calls?select=id,duration_seconds&clinic_id=eq.${CLINIC}&external_ref=eq.${ref}`))) ?? []

const base = await usage()
console.log(`  consumo al empezar: ${base.calls_count} llamadas, ${base.minutes} min\n`)
const show = async (label, ref) => {
  const u = await usage(); const r = await rows(ref)
  console.log(`  ${label.padEnd(34)} filas:${r.length}  duración:${r[0]?.duration_seconds ?? '-'}  llamadas:+${u.calls_count-base.calls_count}  minutos:+${(u.minutes-base.minutes).toFixed(2)}`)
}

// 1 evento nuevo (120 s = 2.00 min)
const A = `idem-a-${stamp}`
await post(A, 120); await show('1. evento nuevo', A)
// 2 el mismo, repetido
await post(A, 120); await show('2. mismo evento repetido', A)
// 3 dos iguales a la vez
const B = `idem-b-${stamp}`
await Promise.all([post(B, 60), post(B, 60)]); await show('3. dos simultáneos (60 s)', B)
// 4 retry con la misma duración
await post(B, 60); await show('4. retry misma duración', B)
// 5 retry con duración mayor (60 -> 180 = +2.00)
await post(B, 180); await show('5. retry duración corregida', B)
// 6 un evento distinto
const C = `idem-c-${stamp}`
await post(C, 30); await show('6. evento distinto (30 s)', C)
// 7 procesar otra vez todo lo anterior: nada debe moverse
await post(A, 120); await post(B, 180); await post(C, 30); await show('7. reproceso de los tres', C)

const end = await usage()
const expected = { calls: 3, minutes: 2.00 + 3.00 + 0.50 }
console.log(`\n  esperado: +3 llamadas, +${expected.minutes.toFixed(2)} min`)
console.log(`  real    : +${end.calls_count-base.calls_count} llamadas, +${(end.minutes-base.minutes).toFixed(2)} min`)
const ok = (end.calls_count-base.calls_count) === expected.calls && Math.abs((end.minutes-base.minutes) - expected.minutes) < 0.001
console.log(ok ? '  CORRECTO' : '  MAL')

// limpieza: las llamadas de prueba y el consumo que añadieron
for (const ref of [A, B, C]) await sb(`calls?clinic_id=eq.${CLINIC}&external_ref=eq.${ref}`, { method: 'DELETE' })
await sb(`usage?clinic_id=eq.${CLINIC}&month=eq.${month}`, { method: 'PATCH', body: JSON.stringify({ calls_count: base.calls_count, minutes: base.minutes }) })
await sb(`activity_log?clinic_id=eq.${CLINIC}&type=eq.call_received`, { method: 'DELETE' })
const back = await usage()
console.log(`  limpieza: consumo devuelto a ${back.calls_count} llamadas, ${back.minutes} min`)
