#!/usr/bin/env node
//
// A Spanish clinic, for a Spanish demo.
//
//   node scripts/seed-spanish-demo.mjs .env.demo.local
//
// The clinic on the telephone is Portuguese, and a number belongs to exactly
// one clinic, so there is no way to reach a Spanish one by dialling. This makes
// the second clinic and leaves it reachable the only other way the init has:
// a conversation that arrives with no number at all, which is what the
// ElevenLabs console sends, answered as whatever TELMA_VOICE_INIT_TEST_CLINIC
// names.
//
// So the Portuguese line is untouched. Point that variable here to record in
// Spanish, point it back at Sorriso afterwards, and nothing in between ever
// touches an agent by hand.
//
// It writes no calls and no appointments on purpose: the point is to make one
// live, on tape, and an empty diary is what makes the hours she offers real.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = readFileSync(process.argv[2] ?? '.env.demo.local', 'utf8')
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1].trim()
const URL_ = pick('NEXT_PUBLIC_SUPABASE_URL')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !KEY) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

const CLINIC = '22222222-2222-2222-2222-222222222222'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function api(path, opts = {}) {
  const r = await fetch(`${URL_}${path}`, { ...opts, headers: { ...H, ...opts.headers } })
  const text = await r.text()
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// Only the hours are rebuilt. Everything else is written once and then left,
// so running this twice does not undo a correction made by hand afterwards.
await api(`/rest/v1/availability_slots?clinic_id=eq.${CLINIC}`, { method: 'DELETE' })

const PROFILE = {
  name: 'Clínica Dental Sonrisa',
  address: 'Calle Serrano 41, Madrid',
  phone: '+34 910 000 000',
  contact_email: 'hola@clinicasonrisa.es',
  plan: 'clinica',
  status: 'ativa',
  minute_limit: 750,
  timezone: 'Europe/Madrid',
  accent: 'brand',
  language: 'es',
  selected_languages: ['es'],
  specialty: 'dentaria',
  region: 'es-madrid',
  // A fuller list than Sorriso's. A dental clinic that says it does not do
  // whitening spends forty seconds of a two-minute recording explaining that.
  services: ['dent_consulta', 'dent_limpeza', 'dent_branqueamento', 'dent_urgencia'],
  appointment_duration_minutes: 30,
  formality: 'formal',
  fallback_policy: 'message',
  calls_recorded: true,
  // Nothing expires during a recording session.
  pre_appointment_auto_expires: false,
  price_info: 'La primera consulta es gratuita. La limpieza dental son 60 €.',
}

const exists = await api(`/rest/v1/clinics?id=eq.${CLINIC}&select=id`)
if (exists.length) {
  await api(`/rest/v1/clinics?id=eq.${CLINIC}`, { method: 'PATCH', body: JSON.stringify(PROFILE) })
  console.log('clínica: ya existía, actualizada')
} else {
  await api('/rest/v1/clinics', { method: 'POST', body: JSON.stringify({ id: CLINIC, ...PROFILE }) })
  console.log('clínica: creada')
}

// The diary is made with the clinic by a trigger; the hours hang off it, and
// hours with no diary generate nothing at all.
const [diary] = await api(
  `/rest/v1/resources?clinic_id=eq.${CLINIC}&active=is.true&select=id&order=sort,created_at&limit=1`
)
if (!diary) {
  await api('/rest/v1/resources', {
    method: 'POST',
    body: JSON.stringify({ id: randomUUID(), clinic_id: CLINIC, name: PROFILE.name, active: true }),
  })
}
const [d] = await api(
  `/rest/v1/resources?clinic_id=eq.${CLINIC}&active=is.true&select=id&order=sort,created_at&limit=1`
)

// Spanish hours, as windows and not as one row per hour.
const slots = []
for (const weekday of [1, 2, 3, 4, 5]) {
  for (const [start_time, end_time] of [['09:00:00', '14:00:00'], ['16:00:00', '20:00:00']]) {
    slots.push({ clinic_id: CLINIC, resource_id: d.id, weekday, start_time, end_time, capacity: 1, active: true })
  }
}
await api('/rest/v1/availability_slots', { method: 'POST', body: JSON.stringify(slots) })

console.log(`
Lista.
  clínica   ${PROFILE.name}
  id        ${CLINIC}
  idioma    español, voz Carolina Ruiz (peninsular)
  horario   lunes a viernes, 09-14 y 16-20 (hora de Madrid)

  Para grabarla, en Vercel:
    TELMA_VOICE_INIT_TEST_CLINIC = ${CLINIC}
  y vuelve a desplegar. Después devuélvela a la clínica portuguesa.
`)
