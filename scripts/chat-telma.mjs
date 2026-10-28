#!/usr/bin/env node
//
// Escrever à Telma, e ela responde. Sem telefone e sem conta de OpenAI.
//
//   npm run chat -- scripts/scenarios/whatsapp-marcacao.mjs --whatsapp
//   npm run chat -- scripts/scenarios/so-recados.mjs            (ao telefone)
//
//   ... --runs    não existe aqui: quem escreve és tu, uma linha de cada vez.
//   ... --llm=gpt-5.4-mini      outro modelo, para comparar
//
// ── POR QUE EXISTE, AO LADO DOS OUTROS DOIS ────────────────────────────────
// scripts/simulate-call.mjs corre uma conversa inteira e dá uma nota, mas o
// paciente é outro modelo: serve para medir, não para experimentar uma frase.
// scripts/simulate-whatsapp.mjs deixa-te escrever, e é o caminho de produção
// -- a nossa cabeça, as nossas ferramentas --, mas precisa da chave do modelo
// que escreve, que é a única coisa deste add-on que ainda não temos.
//
// Isto é o meio: escreves tu, responde a plataforma que já pagamos, com a
// folha que este repositório gera. Chega para a pergunta que se faz primeiro,
// que é "o que é que ela responde se eu lhe escrever isto?".
//
// ── O QUE FALTAVA PARA ISTO FUNCIONAR ──────────────────────────────────────
// `text_only`. O cabeçalho de scripts/measure-latency.mjs diz que mandar
// `{type:'user_message'}` a um agente destes não leva a nada e que a saída era
// escrever o envio de áudio. Não era: um agente de voz não ouve texto, e a
// plataforma tem um interruptor para o pôr a ouvir. Ligado aqui no agente
// descartável, que é nosso e dura o que durar esta conversa.
//
// ── E O QUE ISTO NÃO É ─────────────────────────────────────────────────────
// Não é o caminho de produção. Em produção a cabeça é nossa
// (lib/whatsapp-brain), porque uma conversa de WhatsApp são turnos separados
// por horas e a plataforma não tem como retomar uma por HTTP. Isto é a folha e
// o modelo, que é de onde vem o comportamento, e não a nossa volta por fora.
//
// As ferramentas são as de verdade: uma hora marcada aqui fica marcada na
// agenda daquela clínica. Os cenários apontam à demo, e é aí que têm de
// continuar a apontar.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { AGENT_TTS } from '../lib/onboarding/voice-settings.ts'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const KEY = process.env.ELEVENLABS_API_KEY?.trim()
if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')

const WHATSAPP = process.argv.includes('--whatsapp')
const LLM = process.argv.find((a) => a.startsWith('--llm='))?.slice(6) || 'gpt-5.4-mini'
const scenarioPath = process.argv[2]
if (!scenarioPath || scenarioPath.startsWith('--')) {
  fail('Uso: npm run chat -- scripts/scenarios/<ficheiro>.mjs [--whatsapp]')
}

const scenario = await import(new URL(`../${scenarioPath}`, import.meta.url).href)
const { clinic, criteria: _ignored, language = 'pt', tools, dynamicVariables } = scenario.default

const { buildPrompt, greetingLine, todayInZone, writtenDisclosure } = await import(
  '../lib/onboarding/prompt.ts'
)
const variables = {
  ...clinic,
  today: todayInZone(clinic.timezone, language),
  ...(WHATSAPP ? { channel: 'whatsapp' } : {}),
}
const built = buildPrompt(variables, language)

// ── QUEM FALA PRIMEIRO, OUTRA VEZ ──────────────────────────────────────────
// Ao telefone ela: atende. Por escrito tu, e a apresentação não é dela -- em
// produção é lib/whatsapp-brain que a põe à frente da primeira resposta. Posta
// aqui do mesmo lado e com a mesma função, para que o que leres seja o que o
// paciente lê.
const greeting = WHATSAPP
  ? ''
  : greetingLine(clinic.clinic_name, language, clinic.formality, clinic.recording, [language])

const api = async (method, path, body) => {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok) fail(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 300)}`)
  return r.status === 204 ? null : r.json()
}

// As ferramentas de sistema do agente em vivo, lidas e não copiadas. Ver o
// comentário em simulate-call.mjs: a descrição de `end_call` é o que o modelo
// lê no momento de desligar, e sem ela mede-se outra Telma.
let builtIns = await api('GET', `/v1/convai/agents/agent_9701kzp690x6fnaba03rmp81kt9a`)
  .then((a) => a?.conversation_config?.agent?.prompt?.built_in_tools ?? null)
  .catch(() => null)
// E por escrito não existem nenhuma das duas: não há chamada para desligar nem
// turno para passar numa conversa cujo turno seguinte pode chegar amanhã.
if (WHATSAPP && builtIns) builtIns = { ...builtIns, end_call: null, skip_turn: null }

const agent = await api('POST', '/v1/convai/agents/create', {
  name: `zz-chat-${Date.now()}`,
  conversation_config: {
    agent: {
      prompt: {
        prompt: built.text,
        llm: LLM,
        max_tokens: 300,
        ...(tools ? { tool_ids: tools } : {}),
        ...(builtIns ? { built_in_tools: builtIns } : {}),
      },
      first_message: greeting,
      language,
    },
    // O interruptor. Sem isto o agente é um agente de voz e `user_message` cai
    // no vazio: espera `user_audio_chunk` e mais nada.
    conversation: {
      text_only: true,
      max_duration_seconds: 1800,
      client_events: ['agent_response', 'user_transcript', 'agent_tool_response', 'interruption'],
    },
    tts: { model_id: AGENT_TTS.model_id },
  },
})

console.log(`
  ── ${clinic.clinic_name} ${WHATSAPP ? '(por escrito)' : '(ao telefone, escrito à mão)'} ──
  folha:   ${built.text.length} caracteres, versão ${built.version}
  modelo:  ${LLM}
  agenda:  ${clinic.takes_bookings === false ? 'não (só recados)' : 'sim'}
  ${tools ? `ferramentas: as de verdade, na clínica ${dynamicVariables?.clinic_id ?? '(nenhuma)'}` : 'ferramentas: nenhuma'}
`)

const { signed_url } = await api(
  'GET',
  `/v1/convai/conversation/get-signed-url?agent_id=${agent.agent_id}`
)

const apagar = async () => {
  try {
    await api('DELETE', `/v1/convai/agents/${agent.agent_id}`)
  } catch {
    console.log(`\n  (o agente ${agent.agent_id} ficou por apagar)`)
  }
}

const ws = new WebSocket(signed_url)
let rl = null

const show = (text) => {
  const wrapped = text.replace(/\n/g, '\n         ')
  // Uma linha em branco antes, para que a resposta não se cole ao que
  // escreveste. É a diferença entre ler uma conversa e ler um registo.
  process.stdout.write(`\n  TELMA  ${wrapped}\n\n`)
  rl?.prompt()
}

ws.addEventListener('open', () => {
  ws.send(
    JSON.stringify({
      type: 'conversation_initiation_client_data',
      // As variáveis do cenário: o id da clínica, e o resto do que as
      // ferramentas leem. Sem elas uma marcação não sabe de quem é.
      //
      // Menos as `system__`, que o socket recusa com um 1008 e fecha: são as
      // que a plataforma preenche sozinha -- o id da conversa, o número de
      // onde entra, os segundos que já durou -- e por isso é ela que as põe
      // aqui também. Os cenários trazem-nas porque a simulação por HTTP as
      // aceita, e é lá que são precisas.
      dynamic_variables: Object.fromEntries(
        Object.entries(dynamicVariables ?? {}).filter(([k]) => !k.startsWith('system__'))
      ),
      conversation_config_override: { conversation: { text_only: true } },
    })
  )

  rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '  TU     ' })
  if (WHATSAPP) {
    console.log(`  Escreve como escreveria um paciente, e dá Enter. Ctrl+C para sair.`)
    console.log(`  Em produção a primeira resposta leva isto à frente:`)
    console.log(`  "${writtenDisclosure(clinic.clinic_name, language, clinic.timezone)}"`)
    // ── E DUAS COISAS QUE AQUI SÃO DA BANCADA ──────────────────────────────
    // As duas vêm de isto ser um agente da plataforma a correr ferramentas da
    // plataforma, e nenhuma das duas acontece no add-on. Ditas aqui porque sem
    // isto parecem defeitos da Telma e manda-se alguém atrás delas.
    console.log(`
  Duas coisas que vais ver aqui e não acontecem no WhatsApp a sério:

   · "Vou ver as horas livres" antes de cada ferramenta. É a plataforma que o
     diz, por configuração das ferramentas de voz. No add-on quem chama as
     ferramentas é a nossa volta (lib/whatsapp-brain), que não diz nada: vê e
     responde na mesma mensagem.
   · As horas por extenso ("às nove da manhã"). A ferramenta de voz pede-as à
     agenda sem dizer que são para ler; a de texto pede-as com channel=whatsapp
     e vêm "às 09:00". Ver lib/whatsapp-tools.
`)
  } else {
    console.log(`  Ela atende primeiro, como ao telefone. Ctrl+C para sair.\n`)
  }
  rl.prompt()
  rl.on('line', (line) => {
    const text = line.trim()
    if (!text) return rl.prompt()
    ws.send(JSON.stringify({ type: 'user_message', text }))
  })
  rl.on('close', () => ws.close())
})

ws.addEventListener('message', (ev) => {
  let m
  try {
    m = JSON.parse(ev.data)
  } catch {
    return
  }
  // A plataforma fecha a conversa se não lhe responderem ao ping.
  if (m.type === 'ping') {
    return ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event?.event_id }))
  }
  if (m.type === 'agent_response') {
    const said = m.agent_response_event?.agent_response?.trim()
    if (said) show(said)
    return
  }
  // O que ela foi buscar, e com que argumentos. É isto que distingue "inventou
  // uma hora" de "a agenda deu-lhe essa hora".
  if (process.env.CHAT_DEBUG && m.type !== 'ping') {
    console.log('  [debug]', JSON.stringify(m).slice(0, 400))
  }
  if (m.type === 'agent_tool_response') {
    const t = m.agent_tool_response ?? m.agent_tool_response_event ?? {}
    process.stdout.write(`\n       > ${t.tool_name ?? 'ferramenta'}${t.is_error ? '  (erro)' : ''}\n`)
    return
  }
})

ws.addEventListener('close', async (ev) => {
  if (process.env.CHAT_DEBUG) console.log('  (fechou:', ev.code, ev.reason, ')')
  rl?.close()
  await apagar()
  process.stdout.write('\n  (conversa terminada)\n')
  process.exit(0)
})

ws.addEventListener('error', async (e) => {
  console.error('\n  o socket deu erro:', e.message ?? e)
  await apagar()
  process.exit(1)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      ws.close()
    } catch {}
    await apagar()
    process.exit(0)
  })
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}
