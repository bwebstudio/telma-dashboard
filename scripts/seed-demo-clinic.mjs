// Seeds one believable day for a demo clinic, in the real Supabase project.
// Re-runnable: it wipes this clinic's rows first, so running it again on
// another morning moves the whole day forward.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = readFileSync(process.argv[2], 'utf8')
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1].trim()
const URL_ = pick('NEXT_PUBLIC_SUPABASE_URL')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY')

const CLINIC = '11111111-1111-1111-1111-111111111111'
const EMAIL = 'demo@bwebstudio.com'
const PASSWORD = process.env.DEMO_PASSWORD || 'TelmaDemo2026!'
const TZ = 'Europe/Lisbon'

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

async function api(path, opts = {}) {
  const r = await fetch(`${URL_}${path}`, { ...opts, headers: { ...H, ...opts.headers } })
  const text = await r.text()
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// --- Lisbon local time -> ISO -----------------------------------------------
function offsetMinutes(date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const g = (t) => Number(p.find((x) => x.type === t)?.value ?? 0)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return Math.round((asUtc - date.getTime()) / 60000)
}
const now = new Date()
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now).split('-').map(Number)

/** Clock time in Lisbon on the day `off` days from today. */
function at(off, h, m = 0) {
  const naive = Date.UTC(parts[0], parts[1] - 1, parts[2] + off, h, m, 0, 0)
  const first = new Date(naive - offsetMinutes(now) * 60000)
  return new Date(naive - offsetMinutes(first) * 60000).toISOString()
}

const turns = (...pairs) => pairs.map(([speaker, text]) => ({ speaker, text }))

// --- Auth user ---------------------------------------------------------------
let userId
const existing = await api(`/auth/v1/admin/users?page=1&per_page=200`)
const found = (existing.users || []).find((u) => u.email === EMAIL)
if (found) {
  userId = found.id
  await api(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  })
  console.log('auth: utilizador já existia, palavra-passe reposta')
} else {
  const created = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })
  userId = created.id
  console.log('auth: utilizador criado')
}

// --- Wipe anything this seed wrote before ------------------------------------
for (const t of ['appointments', 'calls', 'usage', 'activity_log', 'availability_slots', 'blocked_days']) {
  await api(`/rest/v1/${t}?clinic_id=eq.${CLINIC}`, { method: 'DELETE' })
}
await api(`/rest/v1/users?id=eq.${userId}`, { method: 'DELETE' })
await api(`/rest/v1/clinics?id=eq.${CLINIC}`, { method: 'DELETE' })

// --- Clinic ------------------------------------------------------------------
await api('/rest/v1/clinics', {
  method: 'POST',
  body: JSON.stringify({
    id: CLINIC,
    name: 'Clínica Dentária Sorriso',
    address: 'Rua das Flores 12, Porto',
    phone: '+351 220 000 000',
    contact_email: 'geral@sorriso.pt',
    plan: 'clinica',
    addon_whatsapp: true,
    status: 'ativa',
    minute_limit: 750,
    assigned_phone: '+351 300 500 900',
    voice_agent_id: 'agent_sorriso_01',
    voice_name: 'Telma PT',
    timezone: TZ,
    accent: 'brand',
  }),
})

await api('/rest/v1/users', {
  method: 'POST',
  body: JSON.stringify({
    id: userId,
    email: EMAIL,
    full_name: 'Receção Sorriso',
    role: 'clinica',
    clinic_id: CLINIC,
    locale: 'pt',
  }),
})

// --- Opening hours: Mon-Fri, 09-13 and 14-18 --------------------------------
const slots = []
for (const wd of [1, 2, 3, 4, 5]) {
  for (const h of [9, 10, 11, 12, 14, 15, 16, 17]) {
    slots.push({
      clinic_id: CLINIC, weekday: wd,
      start_time: `${String(h).padStart(2, '0')}:00:00`,
      end_time: `${String(h + 1).padStart(2, '0')}:00:00`,
      capacity: 1, active: true,
    })
  }
}
await api('/rest/v1/availability_slots', { method: 'POST', body: JSON.stringify(slots) })

// --- Conversations ------------------------------------------------------------
const id = {}
for (const k of ['y1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) id[k] = randomUUID()

const calls = [
  { id: id.y1, channel: 'telefone', from_phone: '+351 912 345 678', patient_name: 'Ana Martins',
    duration_seconds: 108, result: 'marcacao', created_at: at(-1, 14, 55),
    summary: 'Limpeza para hoje às 9h. A Ana pediu de manhã, como sempre.',
    transcript: turns(
      ['telma', 'Clínica Dentária Sorriso, boa tarde. Fala a Telma, em que posso ajudar?'],
      ['paciente', 'Boa tarde, queria marcar uma limpeza.'],
      ['telma', 'Com certeza. Diga-me o seu nome, por favor.'],
      ['paciente', 'Ana Martins.'],
      ['telma', 'Obrigada, Ana. Tenho amanhã às nove da manhã ou quinta às quatro da tarde.'],
      ['paciente', 'De manhã é melhor. Fico com as nove.'],
      ['telma', 'Marcado para amanhã às nove. A receção confirma e, se houver algum problema, ligamos.'],
      ['paciente', 'Obrigada.']) },

  { id: id.c1, channel: 'telefone', from_phone: '+351 210 998 442', patient_name: null,
    duration_seconds: 34, result: 'informacao', created_at: at(0, 8, 22),
    summary: 'Perguntou o horário de sábado e se há estacionamento. Respondido, sem marcação.',
    transcript: turns(
      ['telma', 'Clínica Dentária Sorriso, bom dia. Fala a Telma.'],
      ['paciente', 'Bom dia. Vocês abrem ao sábado?'],
      ['telma', 'Aos sábados não, abrimos de segunda a sexta, das nove à uma e das duas às seis.'],
      ['paciente', 'E há onde estacionar?'],
      ['telma', 'Há o parque da Rua das Flores, a cinquenta metros da porta.'],
      ['paciente', 'Está bem, obrigado. Depois ligo para marcar.']) },

  { id: id.c3, channel: 'whatsapp', from_phone: '+351 968 112 447', patient_name: 'Sofia Ramos',
    duration_seconds: 0, result: 'marcacao', created_at: at(0, 8, 2),
    summary: 'Dor num molar desde sábado. Encaixada hoje às 10h.',
    transcript: turns(
      ['paciente', 'Bom dia, tenho um dente a doer desde sábado. Dá para ir hoje?'],
      ['telma', 'Bom dia. Lamento, vamos tentar encaixar. É dor constante ou só quando come?'],
      ['paciente', 'Constante, do lado direito em baixo.'],
      ['telma', 'Tenho hoje às 10h. Consegue?'],
      ['paciente', 'Consigo sim.'],
      ['telma', 'Marcado, Sofia, hoje às 10h. Se a dor piorar antes disso, ligue para a clínica.'],
      ['paciente', 'Obrigada!']) },

  { id: id.c2, channel: 'telefone', from_phone: '+351 915 660 274', patient_name: 'Rui Almeida',
    duration_seconds: 71, result: 'transferida', created_at: at(0, 9, 44),
    summary: 'Urgência: partiu um incisivo. A Telma passou a chamada à receção, que encaixou às 16h.',
    transcript: turns(
      ['paciente', 'Bom dia, parti um dente agora a comer. Está a sangrar um bocado.'],
      ['telma', 'Lamento. Isso é uma urgência, vou passá-lo já à receção. Diga-me só o seu nome.'],
      ['paciente', 'Rui Almeida.'],
      ['telma', 'Obrigada, Rui. Não desligue, estou a passar a chamada.']) },

  { id: id.c6, channel: 'telefone', from_phone: '+351 934 550 128', patient_name: 'Hélder Braga',
    duration_seconds: 42, result: 'marcacao', created_at: at(0, 10, 12),
    summary: 'Cancelou a destartarização das 11h de hoje. Quer remarcar para a próxima semana.',
    transcript: turns(
      ['paciente', 'Boa tarde, tinha consulta hoje às onze e não vou conseguir ir.'],
      ['telma', 'Sem problema. Diga-me o seu nome para eu encontrar a marcação.'],
      ['paciente', 'Hélder Braga.'],
      ['telma', 'Encontrei, destartarização às onze. Já a cancelei e avisei a clínica. Quer que deixe uma nota para remarcar?'],
      ['paciente', 'Sim, para a próxima semana se puder ser.'],
      ['telma', 'Fica registado. A receção liga-lhe para combinar o dia.']) },

  { id: id.c4, channel: 'telefone', from_phone: '+351 939 004 712', patient_name: 'Tiago Ferreira',
    duration_seconds: 156, result: 'marcacao', created_at: at(0, 11, 52),
    summary: 'Quer aparelho. A Telma explicou que a primeira consulta é de avaliação e marcou para hoje às 14h.',
    transcript: turns(
      ['paciente', 'Olhe, era para saber quanto custa pôr aparelho.'],
      ['telma', 'O preço depende do caso, por isso não lhe sei dizer ao telefone sem o médico ver. A primeira consulta é de avaliação e é aí que fica com o orçamento.'],
      ['paciente', 'E essa quanto é?'],
      ['telma', 'Trinta euros, e desconta no tratamento se avançar.'],
      ['paciente', 'Então marque lá.'],
      ['telma', 'Tenho hoje às duas da tarde ou sexta às onze.'],
      ['paciente', 'Hoje às duas.'],
      ['telma', 'Fica marcado. O seu nome, por favor?'],
      ['paciente', 'Tiago Ferreira.']) },

  { id: id.c5, channel: 'whatsapp', from_phone: '+351 961 448 003', patient_name: 'Beatriz Nogueira',
    duration_seconds: 0, result: 'marcacao', created_at: at(0, 12, 20),
    summary: 'Branqueamento antes do casamento da irmã, dia 22. Marcada para hoje às 15h.',
    transcript: turns(
      ['paciente', 'Boa tarde! Queria fazer branqueamento antes do dia 22, dá tempo?'],
      ['telma', 'Boa tarde, Beatriz. O branqueamento costuma ser em duas sessões com uma semana de intervalo, por isso sim, dá tempo se começar esta semana.'],
      ['paciente', 'Perfeito. Hoje à tarde consigo.'],
      ['telma', 'Tenho às 15h. Marco?'],
      ['paciente', 'Sim, por favor.'],
      ['telma', 'Deixei marcado para hoje às 15h. A receção confirma já a seguir.']) },

  { id: id.c7, channel: 'whatsapp', from_phone: '+351 911 907 443', patient_name: 'Alice Ventura',
    duration_seconds: 0, result: 'marcacao', created_at: at(0, 16, 40),
    summary: 'Limpeza para amanhã às 11h, primeira hora livre da manhã.',
    transcript: turns(
      ['paciente', 'Olá, queria marcar uma limpeza para amanhã de manhã se der.'],
      ['telma', 'Olá. Amanhã de manhã tenho às 11h, é a primeira livre. Serve?'],
      ['paciente', 'Serve.'],
      ['telma', 'Marcado para amanhã às 11h. O seu nome?'],
      ['paciente', 'Alice Ventura.']) },

  { id: id.c8, channel: 'telefone', from_phone: '+351 933 771 002', patient_name: null,
    duration_seconds: 19, result: 'nao_resolvida', created_at: at(0, 17, 5),
    summary: 'A chamada caiu ao fim de dezanove segundos, antes de dizer o que queria.',
    transcript: turns(
      ['telma', 'Clínica Dentária Sorriso, boa tarde. Fala a Telma, em que posso ajudar?'],
      ['paciente', 'Sim, boa tarde, era para…']) },
].map((c) => ({ ...c, clinic_id: CLINIC, recording_url: null }))

await api('/rest/v1/calls', { method: 'POST', body: JSON.stringify(calls) })

// --- Appointments -------------------------------------------------------------
const appts = [
  { patient_name: 'Carla Esteves', patient_phone: '+351 912 004 551', reason: 'Destartarização',
    scheduled_at: at(-1, 10), status: 'copiada', origin: 'telefone',
    summary: 'Limpeza anual. Já passada para o software da clínica.', decided_at: at(-2, 9, 20), created_at: at(-2, 9, 12) },
  { patient_name: 'Nuno Bastos', patient_phone: '+351 926 771 330', reason: 'Revisão de aparelho',
    scheduled_at: at(-1, 16, 30), status: 'copiada', origin: 'whatsapp',
    summary: 'Ajuste do aparelho. Pediu o fim da tarde.', decided_at: at(-2, 12), created_at: at(-2, 11, 48) },

  { patient_name: 'Ana Martins', patient_phone: '+351 912 345 678', reason: 'Limpeza',
    scheduled_at: at(0, 9), status: 'copiada', origin: 'telefone', call_id: id.y1,
    summary: 'Limpeza de rotina. Prefere sempre de manhã.', decided_at: at(-1, 15, 2), created_at: at(-1, 14, 55) },
  { patient_name: 'Carlos Nunes', patient_phone: '+351 913 887 220', reason: 'Revisão',
    scheduled_at: at(0, 9, 30), status: 'copiada', origin: 'telefone',
    summary: 'Revisão dos seis meses.', decided_at: at(-3, 10), created_at: at(-3, 9, 55) },
  { patient_name: 'Sofia Ramos', patient_phone: '+351 968 112 447', reason: 'Dor num molar',
    scheduled_at: at(0, 10), status: 'confirmada', origin: 'whatsapp', call_id: id.c3,
    summary: 'Dor do lado direito desde sábado. A Telma encaixou às 10h.', decided_at: at(0, 8, 5), created_at: at(0, 8, 2) },
  { patient_name: 'Hélder Braga', patient_phone: '+351 934 550 128', reason: 'Destartarização',
    scheduled_at: at(0, 11), status: 'cancelada', origin: 'telefone', call_id: id.c6,
    summary: 'Tinha marcado há duas semanas.', cancelled_at: at(0, 10, 14), cancelled_by: 'paciente',
    cancel_reason: 'Ficou retido no trabalho. Quer remarcar para a próxima semana.', created_at: at(-14, 11, 10) },
  { patient_name: 'Marta Lopes', patient_phone: '+351 917 233 909', reason: 'Consulta de rotina',
    scheduled_at: at(0, 11, 30), status: 'confirmada', origin: 'telefone',
    summary: 'Rotina anual.', decided_at: at(-5, 16), created_at: at(-5, 15, 40) },
  { patient_name: 'Tiago Ferreira', patient_phone: '+351 939 004 712', reason: 'Ortodontia — primeira avaliação',
    scheduled_at: at(0, 14), status: 'pendente', origin: 'telefone', call_id: id.c4,
    summary: 'Quer avaliação para aparelho. A Telma explicou que a primeira consulta é de diagnóstico.', created_at: at(0, 11, 54) },
  { patient_name: 'Beatriz Nogueira', patient_phone: '+351 961 448 003', reason: 'Branqueamento',
    scheduled_at: at(0, 15), status: 'pendente', origin: 'whatsapp', call_id: id.c5,
    summary: 'Pergunta se dá para fazer antes do casamento da irmã, dia 22.', created_at: at(0, 12, 22) },
  { patient_name: 'Rui Almeida', patient_phone: '+351 915 660 274', reason: 'Urgência — dente partido',
    scheduled_at: at(0, 16), status: 'confirmada', origin: 'telefone', call_id: id.c2,
    summary: 'Partiu um incisivo a comer. A Telma passou a chamada à receção.', decided_at: at(0, 9, 48), created_at: at(0, 9, 44) },
  { patient_name: 'Inês Cardoso', patient_phone: '+351 927 810 566', reason: 'Primeira consulta',
    scheduled_at: at(0, 17), status: 'confirmada', origin: 'whatsapp',
    summary: 'Veio pela indicação da irmã, que já é paciente.', decided_at: at(-1, 18, 10), created_at: at(-1, 18, 4) },

  { patient_name: 'Paulo Serra', patient_phone: '+351 969 332 118', reason: 'Endodontia',
    scheduled_at: at(1, 9, 30), status: 'confirmada', origin: 'telefone',
    summary: 'Segunda sessão do tratamento de canal.', decided_at: at(-7, 11), created_at: at(-7, 10, 50) },
  { patient_name: 'Alice Ventura', patient_phone: '+351 911 907 443', reason: 'Limpeza',
    scheduled_at: at(1, 11), status: 'pendente', origin: 'whatsapp', call_id: id.c7,
    summary: 'Pediu a primeira hora livre da manhã.', created_at: at(0, 16, 42) },
  { patient_name: 'Diogo Meireles', patient_phone: '+351 934 002 887', reason: 'Revisão',
    scheduled_at: at(1, 15, 30), status: 'confirmada', origin: 'telefone',
    summary: 'Revisão semestral.', decided_at: at(-4, 9), created_at: at(-4, 8, 52) },
  { patient_name: 'Fernando Pires', patient_phone: '+351 962 771 004', reason: 'Implante',
    scheduled_at: at(2, 10), status: 'rejeitada', origin: 'telefone',
    summary: 'Pediu consulta de implantes.',
    reject_reason: 'O Dr. Almeida só faz implantes às quintas. Remarcado por telefone.',
    decided_at: at(-1, 17, 30), created_at: at(-1, 17, 12) },
].map((a) => ({
  // PostgREST inserts a batch as one statement, so every object has to carry
  // the same keys — a row missing `cancelled_at` is not "use the default", it
  // is a 400.
  clinic_id: CLINIC,
  call_id: null,
  reason: null,
  summary: null,
  reject_reason: null,
  decided_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  ...a,
}))

await api('/rest/v1/appointments', { method: 'POST', body: JSON.stringify(appts) })

// --- Usage and activity --------------------------------------------------------
const month = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-01`
await api('/rest/v1/usage', {
  method: 'POST',
  body: JSON.stringify({ clinic_id: CLINIC, month, calls_count: 205, minutes: 520.5 }),
})
await api('/rest/v1/activity_log', {
  method: 'POST',
  body: JSON.stringify([
    { clinic_id: CLINIC, type: 'clinic_created', message: 'Clínica de demonstração criada', created_at: at(-30, 9) },
    { clinic_id: CLINIC, type: 'appointment_created', message: 'A Telma deixou uma pré-marcação para Tiago Ferreira', created_at: at(0, 11, 54) },
    { clinic_id: CLINIC, type: 'call_received', message: 'A Telma atendeu uma chamada', created_at: at(0, 17, 5) },
  ]),
})

console.log(`
Pronto.
  clínica    Clínica Dentária Sorriso (${CLINIC})
  login      ${EMAIL}
  password   ${PASSWORD}
  marcações  ${appts.length}
  conversas  ${calls.length}  (${calls.filter((c) => c.channel === 'whatsapp').length} de WhatsApp)
`)
