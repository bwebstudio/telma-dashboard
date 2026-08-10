#!/usr/bin/env node
//
// Creates Telma's tools in ElevenLabs and attaches them to an agent.
//
//   node scripts/elevenlabs-wire-tools.mjs --base https://xxxx.ngrok-free.dev --agent agent_xxx
//   node scripts/elevenlabs-wire-tools.mjs --base ... --agent ... --dry
//
// Idempotent: a tool that already exists by name is updated, not duplicated.
//
// Needs an API key with `convai_write`. Reading is not enough, and the failure
// is explicit rather than partial: nothing is created if the key cannot write.
//
// ── WHY THERE IS NO "GET CONTEXT" TOOL ──────────────────────────────────────
// There was going to be one, and then the conversation initiation webhook made
// it unnecessary. /api/voice/init already hands the agent the prompt, the first
// message, the language, the voice and `clinic_id` before the call starts, so
// asking for the same thing again as the first tool call would spend a round
// trip to learn what the agent already knows. /api/clinic-context still exists
// and is still useful, but it is now a panel and debugging endpoint rather than
// part of the call path.

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}
const DRY = args.includes('--dry')
const CREATE = args.includes('--create')
const PRUNE = args.includes('--prune')
const BASE = (flag('base') ?? '').replace(/\/$/, '')
// Um sufixo dá a este conjunto de ferramentas um nome só seu, para que criar as
// da demonstração não vá alterar as que já apontam para outro sítio: elas são
// procuradas pelo nome, e sem isto "criar" quer dizer "reescrever".
const SUFFIX = flag('suffix') ?? ''
const AGENT_NAME = flag('name') ?? 'Telma'
let AGENT = flag('agent')

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
// O token é o da instalação a que as ferramentas vão bater, e não há um só: a
// demonstração tem o seu, e usar o de casa deixaria as chamadas a receber 401
// sem nada no ecrã que o explicasse.
const TOKEN = flag('token') ?? env('TELMA_WEBHOOK_TOKEN')

if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')
if (!TOKEN) fail('TELMA_WEBHOOK_TOKEN não encontrado.')
if (!BASE) fail('Falta --base https://... (o URL público onde a app está a correr).')

function fail(msg) {
  console.error(`\n  ${msg}\n`)
  process.exit(1)
}

const auth = { Authorization: `Bearer ${TOKEN}` }

// The tools ------------------------------------------------------------------
// `dynamic_variable` on a parameter means the value comes from the conversation
// rather than from the model: `clinic_id` is set by /api/voice/init, and the
// `system__` ones are ElevenLabs' own. Everything the model has to decide (a
// date, a name, what the call was about) is left for it to fill, and everything
// that is a fact about the call is not.

const TOOLS = [
  {
    name: 'telma_horas_livres',
    // Diz alguma coisa antes de consultar, em vez de deixar a linha em silêncio.
    //
    // Pedi isto no prompt em tempos e saiu mal: o modelo passou a falar duas
    // vezes por cada consulta, e ouvia-se a costura. Isto é o mecanismo da
    // própria plataforma para o mesmo fim, e não gera um turno a mais.
    force_pre_tool_speech: true,
    description:
      'Consulta as horas realmente livres da clínica. Usa isto SEMPRE antes de oferecer qualquer hora: nunca inventes disponibilidade. Cada slot traz say (a hora já na hora da clínica, para dizeres em voz alta) e slot_start (identificador em UTC, para devolveres às outras ferramentas, nunca para ler).',
    api_schema: {
      url: `${BASE}/api/availability`,
      method: 'GET',
      request_headers: auth,
      query_params_schema: {
        properties: {
          clinic_id: { type: 'string', dynamic_variable: 'clinic_id' },
          date: {
            type: 'string',
            description:
              'O primeiro dia a consultar, no formato YYYY-MM-DD. Se a pessoa não pediu um dia concreto, põe hoje.',
          },
          days: {
            type: 'integer',
            description:
              'Quantos dias olhar a partir dessa data. Põe 7 quando a pessoa não pediu um dia em concreto, para poderes oferecer horas em dias diferentes. Põe 1 só quando ela pediu mesmo aquele dia. A resposta traz days_with_slots com os dias que têm horas.',
          },
        },
        required: ['clinic_id', 'date', 'days'],
      },
    },
  },
  {
    name: 'telma_reservar_hora',
    description:
      'Segura uma hora concreta durante três minutos, enquanto confirmas o nome e o telefone. Usa isto depois de a pessoa escolher uma hora e antes de lhe pedir os dados, para que outra chamada em simultâneo não fique com a mesma hora.',
    api_schema: {
      url: `${BASE}/api/availability`,
      method: 'POST',
      request_headers: auth,
      content_type: 'application/json',
      request_body_schema: {
        type: 'object',
        properties: {
          clinic_id: { type: 'string', dynamic_variable: 'clinic_id' },
          slot_start: {
            type: 'string',
            description: 'O identificador slot_start da hora escolhida, copiado tal e qual de telma_horas_livres. Não é a hora que disseste em voz alta.',
          },
          call_ref: { type: 'string', dynamic_variable: 'system__conversation_id' },
        },
        required: ['clinic_id', 'slot_start', 'call_ref'],
      },
    },
  },
  {
    name: 'telma_ver_marcacoes',
    force_pre_tool_speech: true,
    description:
      'Vê o que este número tem marcado nesta clínica, e se quem liga já é paciente. Usa isto quando alguém quer cancelar ou mudar uma marcação, e também fora do horário antes de decidir se passas uma urgência. NÃO devolve o nome de propósito: o nome tem de ser a pessoa a dizê-lo.',
    api_schema: {
      url: `${BASE}/api/appointments`,
      method: 'GET',
      request_headers: auth,
      query_params_schema: {
        properties: {
          clinic_id: { type: 'string', dynamic_variable: 'clinic_id' },
          phone: {
            type: 'string',
            description:
              'O número de quem liga. Usa o número da chamada; se a pessoa disser outro, usa o que ela disser.',
          },
        },
        required: ['clinic_id', 'phone'],
      },
    },
  },
  {
    name: 'telma_cancelar_marcacao',
    description:
      'Cancela uma marcação. Só chama isto depois de a pessoa dizer o nome completo, e passa-o tal como o ouviste: é o servidor que confere se bate certo com o da marcação. Se responder que não bate, não insistas nem canceles outra: toma o recado.',
    api_schema: {
      url: `${BASE}/api/appointments`,
      method: 'POST',
      request_headers: auth,
      content_type: 'application/json',
      request_body_schema: {
        type: 'object',
        properties: {
          clinic_id: { type: 'string', dynamic_variable: 'clinic_id' },
          appointment_id: {
            type: 'string',
            description: 'O appointment_id que veio de telma_ver_marcacoes.',
          },
          phone: { type: 'string', description: 'O mesmo número usado na consulta.' },
          name: {
            type: 'string',
            description: 'O nome completo, tal como a pessoa o disse. Não o corrijas nem o completes.',
          },
          reason: {
            type: 'string',
            description: 'O motivo do cancelamento, se a pessoa o disser. Caso contrário omite.',
          },
        },
        required: ['clinic_id', 'appointment_id', 'phone', 'name'],
      },
    },
  },
  {
    name: 'telma_registar_chamada',
    description:
      'Regista a chamada no painel da clínica. Chama isto UMA vez, no fim de todas as chamadas, mesmo que não tenha havido marcação. Inclui o objecto appointment apenas quando ficou uma marcação.',
    api_schema: {
      url: `${BASE}/api/webhook/call`,
      method: 'POST',
      request_headers: auth,
      content_type: 'application/json',
      request_body_schema: {
        type: 'object',
        properties: {
          clinic_id: { type: 'string', dynamic_variable: 'clinic_id' },
          from_phone: { type: 'string', dynamic_variable: 'system__caller_id' },
          duration_seconds: { type: 'integer', dynamic_variable: 'system__call_duration_secs' },
          call_ref: { type: 'string', dynamic_variable: 'system__conversation_id' },
          result: {
            type: 'string',
            description:
              'Como acabou: "marcacao" se ficou uma marcação, "transferida" se passaste a chamada, "informacao" se só deste informação, "nao_resolvida" se não conseguiste ajudar.',
          },
          summary: {
            type: 'string',
            description:
              'Duas ou três frases sobre o que a pessoa queria e o que ficou combinado, na língua da clínica. É o que a rececionista vai ler no painel. Inclui SEMPRE o que a pessoa pediu que a clínica faça — que lhe liguem por causa do preço, que confirmem alguma coisa, que falem com alguém — porque isso é trabalho para alguém e perde-se se não ficar escrito.',
          },
          appointment: {
            type: 'object',
            description:
              'Só quando houve marcação. Caso contrário, omite este campo por completo.',
            properties: {
              patient_name: { type: 'string', description: 'Nome completo, como o confirmaste.' },
              patient_phone: { type: 'string', description: 'Telefone que confirmaste, em formato internacional.' },
              reason: {
                type: 'string',
                description:
                  'O tratamento ou motivo, nas palavras da própria pessoa: "lifting", "limpeza", "dor num dente". Não escrevas rótulos genéricos como "consulta de avaliação" quando ela disse outra coisa: quem lê isto no painel precisa de saber para que vem, e é a única forma de a clínica preparar a consulta.',
              },
              scheduled_at: { type: 'string', description: 'O identificador slot_start da hora marcada, copiado tal e qual. Não é a hora que disseste em voz alta.' },
            },
          },
        },
        required: ['clinic_id', 'result'],
      },
    },
  },
]

// The one agent ---------------------------------------------------------------
// There is exactly one, shared by every clinic, and almost nothing about it is
// decided here: the prompt, the opening line, the language and the voice all
// arrive from /api/voice/init when the call starts.
//
// What is decided here is what happens when that fails. ElevenLabs will not
// accept an agent with no prompt at all, and whatever is left in that box is
// what a patient hears if the webhook times out or the app is down. The default
// it ships with is "You are a helpful assistant." in English, which would have
// an English-speaking stranger with no idea what clinic it is improvising
// answers about someone's appointment. So the box holds a fallback that is
// honest about not knowing anything, takes a message, and books nothing.

const AGENT_SPEC = {
  name: AGENT_NAME,
  conversation_config: {
    agent: {
      // Read only when /api/voice/init did not answer. Every line of it exists
      // to make an unconfigured Telma useless rather than confidently wrong.
      prompt: {
        prompt: [
          'Eres Telma, la recepcionista telefónica de una clínica.',
          '',
          'Ahora mismo no has podido cargar la información de la clínica: no sabes cuál es, ni qué servicios tiene, ni qué horario, ni qué agenda. Esto es una avería, y la persona que llama no tiene la culpa.',
          '',
          'Responde siempre en el idioma en que te hablen.',
          '',
          'Dices que en este momento no puedes consultar la agenda, te disculpas una vez, y pides el nombre y un teléfono para que la clínica devuelva la llamada. Lo repites en voz alta una vez para confirmarlo, te despides y cuelgas.',
          '',
          'No das ninguna cita. No confirmas ninguna hora. No inventas horarios, precios, direcciones ni servicios. No dices que la clínica está abierta ni cerrada. Si insisten, repites que hoy solo puedes tomar el recado.',
          '',
          'Si la persona describe algo urgente, le dices que cuelgue y llame al 112.',
        ].join('\n'),
        // Sólo la familia GPT-5 deja apagar el razonamiento en esta plataforma,
        // y sin control el modelo delibera antes de cada turno. `low` sigue los
        // ocho pasos de una cita sin costar el segundo de más.
        llm: 'gpt-5.4-mini',
        reasoning_effort: 'low',
        built_in_tools: {
          end_call: {
            name: 'end_call',
            description:
              'Termina a chamada. Usa depois de te despedires e de a pessoa responder, ou quando te pedirem para desligar.',
          },
          skip_turn: {
            name: 'skip_turn',
            description:
              'Não digas nada e espera. Usa quando a pessoa está a pensar, a procurar um dado ou a falar com alguém.',
          },
          // Sem isto o prompt promete uma coisa que a plataforma não faz. Ele diz
          // "respondes na língua em que te falarem", e a conversa fica presa na
          // que abriu: o modelo escreve português e o reconhecimento continua à
          // espera de espanhol.
          language_detection: {
            name: 'language_detection',
            description:
              'Muda a língua da conversa quando a pessoa passa a falar outra das que esta clínica atende, ou quando pede para falares noutra.',
          },
        },
      },
      first_message:
        'Hola, le habla Telma. Disculpe, en este momento tengo un problema técnico y no puedo consultar la agenda. ¿Me deja su nombre y un teléfono y le devolvemos la llamada?',
      language: 'pt',
      // Sem isto a ElevenLabs recusa começar a conversa: valida que cada
      // ferramenta tem as suas variáveis ANTES de chamar o webhook de arranque,
      // e nessa altura `clinic_id` ainda não existe.
      //
      // O valor é de propósito inválido. Pôr aqui uma clínica que exista seria o
      // pior desenho possível: se o arranque falhasse, a chamada corria contra a
      // agenda de outra pessoa em silêncio.
      dynamic_variables: { dynamic_variable_placeholders: { clinic_id: 'sem-clinica' } },
      // El saludo lleva el aviso de grabación, que es una obligación legal y no
      // una cortesía. Que una tos lo corte significa llamadas donde nadie lo oyó.
      disable_first_message_interruptions: true,
    },
    // ── AJUSTES QUE COSTARON UNA TARDE, Y POR ESO VIVEN AQUÍ ────────────────
    // Un segundo agente creado desde cero nació con los valores de fábrica y
    // repitió, uno por uno, los fallos ya resueltos: la voz entrecortada, el
    // modelo que se saltaba los pasos, no saber colgar, quedarse escuchando
    // siete segundos después de que el otro terminara. La configuración hecha a
    // mano no se hereda; ésta sí.
    tts: {
      // Un agente que no sea inglés exige turbo o flash v2_5: es requisito de la
      // plataforma, no una preferencia nuestra.
      model_id: 'eleven_turbo_v2_5',
      // A voz da língua base do agente. As outras vêm nos presets abaixo, porque
      // mudar de língua a meio e continuar com a mesma voz dá uma espanhola a
      // falar português, que se nota mais do que o sotaque que se queria evitar.
      voice_id: env('ELEVENLABS_VOICE_ID_PT') ?? undefined,
      // 0 y no 3: el troceado agresivo arranca una entonación nueva por trozo, y
      // eso es lo que se oye como voz de máquina.
      optimize_streaming_latency: 0,
      // 0.7 está en la ventana: por debajo salta de aguda a seria entre frases,
      // por encima de 0.8 arrastra y repite sílabas.
      stability: 0.7,
      similarity_boost: 0.75,
    },
    turn: {
      // Cuatro segundos, no siete. Siete es una eternidad al teléfono: quien ha
      // terminado de hablar cree que la línea se ha caído.
      turn_timeout: 4.0,
      // `eager` cierra el turno en cuanto la frase suena terminada, en vez de
      // esperar a que el silencio lo confirme. Es la única palanca que queda
      // contra el ruido de sala: la plataforma no expone un umbral de VAD, solo
      // el interruptor de voces de fondo, y en una habitación con un bebé eso no
      // basta. El riesgo es cortar a quien hace una pausa a media frase.
      turn_eagerness: 'eager',
      // Apagado: genera antes de que el interlocutor termine y luego continúa, y
      // las dos generaciones se cosen con una costura audible.
      speculative_turn: false,
      // El relleno mientras espera una herramienta lo pone la plataforma. Pedirlo
      // en el prompt le hacía hablar dos veces por cada consulta.
      soft_timeout_config: {
        timeout_seconds: 2.5,
        message: 'Mmm...',
        use_llm_generated_message: true,
        max_soft_timeouts_per_generation: 1,
      },
    },
    // Distingue la voz de quien llama de la tele, de un bebé o de alguien más
    // en la sala.
    vad: { background_voice_detection: true },
    // El catalán no está en la lista que acepta ElevenLabs, aunque lo ofrezcamos
    // en el alta. Ver a memória do projecto.
    language_presets: {
      es: { overrides: { tts: { voice_id: env('ELEVENLABS_VOICE_ID_ES') ?? undefined } } },
      en: { overrides: { tts: { voice_id: env('ELEVENLABS_VOICE_ID_EN') ?? undefined } } },
    },
  },
}

// Doing it -------------------------------------------------------------------

async function api(path, method = 'GET', body) {
  const res = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  if (!res.ok) {
    const detail = json?.detail?.message ?? json?.detail ?? text.slice(0, 200)
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    err.status = res.status
    throw err
  }
  return json
}

console.log(`\n  base:  ${BASE}`)
console.log(`  agent: ${AGENT ?? '(nenhum: só cria as ferramentas)'}`)
if (DRY) console.log('  MODO SECO: não escreve nada\n')
else console.log('')

const existing = await api('/convai/tools').catch((e) => fail(`Não consegui listar as ferramentas: ${e.message}`))
const byName = new Map((existing.tools ?? []).map((t) => [t.tool_config?.name ?? t.name, t]))

const ids = []
for (const tool of TOOLS) {
  const name = `${tool.name}${SUFFIX}`
  const payload = {
    tool_config: { type: 'webhook', ...tool, name, response_timeout_secs: 20 },
  }
  const found = byName.get(name)

  if (DRY) {
    console.log(`  ${found ? 'actualizaria' : 'criaria  '}  ${name}`)
    continue
  }

  try {
    if (found) {
      const id = found.id ?? found.tool_id
      await api(`/convai/tools/${id}`, 'PATCH', payload)
      ids.push(id)
      console.log(`  actualizada  ${name}  ${id}`)
    } else {
      const created = await api('/convai/tools', 'POST', payload)
      const id = created.id ?? created.tool_id
      ids.push(id)
      console.log(`  criada       ${name}  ${id}`)
    }
  } catch (e) {
    if (e.status === 401) {
      fail(
        `A chave não pode escrever (${e.message}).\n  Active o scope "ElevenAgents: Write" em Developers > API Keys.`
      )
    }
    fail(`${name}: ${e.message}`)
  }
}

if (CREATE && !DRY) {
  const created = await api('/convai/agents/create', 'POST', AGENT_SPEC)
  AGENT = created.agent_id ?? created.id
  console.log(`\n  agente criado    ${AGENT_SPEC.name}  ${AGENT}`)
}

if (AGENT && !DRY) {
  const agent = await api(`/convai/agents/${AGENT}`)
  // `tools` é o campo antigo, com as ferramentas escritas por dentro. A API
  // devolve-o na leitura mas recusa recebê-lo ao lado de `tool_ids`, por isso
  // reenviar tal e qual o que se leu rebenta. Fica de fora.
  const { tools: _legacy, ...prompt } = agent?.conversation_config?.agent?.prompt ?? {}
  const merged = [...new Set([...(prompt.tool_ids ?? []), ...ids])]

  await api(`/convai/agents/${AGENT}`, 'PATCH', {
    conversation_config: { agent: { prompt: { ...prompt, tool_ids: merged } } },
  })
  console.log(`\n  ligadas ao agente ${AGENT}: ${merged.length} ferramentas`)

  // ── O interruptor sem o qual nada disto conta ──────────────────────────────
  // A ElevenLabs aceita o que /api/voice/init devolve apenas se o agente
  // declarar, campo a campo, que esse campo é sobreponível. O default é `false`
  // em todos, e um campo a `false` não dá erro: é ignorado em silêncio, e a
  // chamada corre com o prompt que estiver colado no agente. Foi por isto que
  // este passo deixou de ser uma nota no fim do script e passou a ser código.
  const platform = agent?.platform_settings ?? {}
  const current = platform.overrides ?? {}
  const cco = current.conversation_config_override ?? {}

  await api(`/convai/agents/${AGENT}`, 'PATCH', {
    platform_settings: {
      ...platform,
      overrides: {
        ...current,
        enable_conversation_initiation_client_data_from_webhook: true,
        conversation_config_override: {
          ...cco,
          agent: {
            ...(cco.agent ?? {}),
            first_message: true,
            language: true,
            prompt: { ...(cco.agent?.prompt ?? {}), prompt: true },
          },
          tts: { ...(cco.tts ?? {}), voice_id: true },
        },
      },
    },
  })
  console.log('  overrides ligados:   prompt, first_message, language, voice_id')

  const after = await api(`/convai/agents/${AGENT}`)
  const check = after?.platform_settings?.overrides ?? {}
  const c2 = check.conversation_config_override ?? {}
  const flags = {
    webhook: check.enable_conversation_initiation_client_data_from_webhook,
    prompt: c2.agent?.prompt?.prompt,
    first_message: c2.agent?.first_message,
    language: c2.agent?.language,
    voice_id: c2.tts?.voice_id,
  }
  const off = Object.entries(flags).filter(([, v]) => v !== true)
  if (off.length) {
    console.log(`\n  ATENÇÃO: continuam desligados -> ${off.map(([k]) => k).join(', ')}`)
    console.log('  Ligue-os à mão no agente, em Security, antes de testar.')
  } else {
    console.log('  confirmado por leitura: os cinco estão a true')
  }
}

// A URL vive no workspace, não no agente. O agente só diz "sim, vai buscar";
// onde ir buscar é uma definição partilhada por todos os agentes da conta.
if (!DRY) {
  const initUrl = `${BASE}/api/voice/init`
  const initToken = env('TELMA_VOICE_INIT_TOKEN')
  try {
    await api('/convai/settings', 'PATCH', {
      conversation_initiation_client_data_webhook: {
        url: initUrl,
        request_headers: initToken ? { Authorization: `Bearer ${initToken}` } : {},
      },
    })
    const settings = await api('/convai/settings')
    const set = settings?.conversation_initiation_client_data_webhook?.url
    console.log(`\n  webhook de arranque: ${set ?? '(não ficou gravado)'}`)
  } catch (e) {
    console.log(`\n  webhook de arranque NÃO ficou: ${e.message}`)
    console.log(`  Ponha à mão:  ${initUrl}`)
  }
}

// Um agente a mais não é inofensivo: é um número que pode ficar apontado para
// ele, com o prompt de fábrica lá dentro, e ninguém a dar por isso. Apaga todos
// menos aquele que acabámos de configurar.
if (PRUNE && AGENT && !DRY) {
  const { agents = [] } = await api('/convai/agents?page_size=100')
  const others = agents.filter((a) => a.agent_id !== AGENT)
  if (!others.length) console.log('\n  não havia mais nenhum agente para apagar')
  for (const a of others) {
    try {
      await api(`/convai/agents/${a.agent_id}`, 'DELETE')
      console.log(`  apagado          ${a.name}  ${a.agent_id}`)
    } catch (e) {
      console.log(`  NÃO apagado      ${a.name}  ${a.agent_id}: ${e.message}`)
    }
  }
}

if (AGENT && !DRY) {
  console.log(`
  Ponha isto no .env.local:

    ELEVENLABS_AGENT_ID=${AGENT}
`)
}
