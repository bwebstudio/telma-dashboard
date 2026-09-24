#!/usr/bin/env node
//
// A throwaway Spanish agent, to record a clip against.
//
//   node scripts/spanish-demo-agent.mjs                 crea
//   node scripts/spanish-demo-agent.mjs --delete <id>   borra
//
// The clinic on the telephone is Portuguese and a number belongs to one clinic,
// so there is no way to hear Spanish on the live line. The obvious route was to
// repoint TELMA_VOICE_INIT_TEST_CLINIC, which answers a conversation that
// arrives with no number, but that is a variable and a deploy and it changes
// what the live agent does while it is set.
//
// This is the smaller move: a second agent, built from the same prompt the
// server builds for that clinic, carrying the clinic's id in its own
// placeholders so the tools work, and answering in Carolina's voice. Talk to it
// in the ElevenLabs console, record the audio, delete it. "Telma demo" is never
// touched and nothing is deployed.
//
// It writes into the demo database like any other call, which is the point: the
// hours it offers are real and the booking it leaves is real.
import { readFileSync } from 'node:fs'

const local = readFileSync('.env.local', 'utf8')
const KEY = local.match(/^ELEVENLABS_API_KEY=(.*)$/m)?.[1].trim()
const VOICE_ES = local.match(/^ELEVENLABS_VOICE_ID_ES=(.*)$/m)?.[1].trim()
if (!KEY) throw new Error('falta ELEVENLABS_API_KEY en .env.local')

const BASE = 'https://telma-dashboard-demo.vercel.app'
const NUMBER = '+34910000001'
const LIVE = 'agent_9701kzp690x6fnaba03rmp81kt9a'

// Voice. The same one the telephone uses, and that is not a compromise.
//
//   --model=eleven_v3_conversational  la del agente en vivo (por defecto)
//   --model=eleven_multilingual_v2    más lenta y sin expressive; ver abajo
//
// `eleven_v3` y `eleven_v4` los rechaza la cuenta ("Expressive TTS is not
// allowed", "V4 TTS is not allowed"): es el plan de ElevenLabs, no un ajuste,
// y por eso la voz de HeyGen no se puede pedir desde aquí.
//
// Multilingual parecía la opción de calidad porque en una grabación la latencia
// da igual. Es al revés: el propio panel la mide en ~482ms contra ~172ms de V3
// Conversational, y sobre todo **no admite expressive mode**, que es lo que le
// da la entonación. Las otras palancas tampoco existen ahí: "voice settings
// (stability, speed, similarity) are not customizable for v3 models", así que
// la estabilidad que se le pase a un modelo v3 no hace nada.
const MODEL = process.argv.find((a) => a.startsWith('--model='))?.slice(8) || 'eleven_v3_conversational'
const EXPRESSIVE = MODEL.startsWith('eleven_v3')

const api = async (path, method = 'GET', body) => {
  const r = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method,
    headers: { 'xi-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

const del = process.argv.indexOf('--delete')
if (del >= 0) {
  const id = process.argv[del + 1]
  if (!id) throw new Error('uso: --delete agent_...')
  if (id === LIVE) throw new Error('ese es el agente en vivo, no se borra desde aquí')
  // Las herramientas copiadas se van con él: quedan cinco por agente y nadie
  // las reconocería como basura dentro de una semana.
  let tools = []
  try {
    const a = await api(`/convai/agents/${id}`)
    tools = a.conversation_config?.agent?.prompt?.tool_ids ?? []
  } catch {}
  await api(`/convai/agents/${id}`, 'DELETE')
  let gone = 0
  for (const t of tools) {
    const { tool_config } = await api(`/convai/tools/${t}`).catch(() => ({ tool_config: null }))
    // Sólo las copias. Las del agente en vivo no terminan en `_es`.
    if (!tool_config?.name?.endsWith('_es')) continue
    await api(`/convai/tools/${t}`, 'DELETE').then(() => gone++).catch(() => {})
  }
  console.log(`\n  borrado ${id}${gone ? ` y ${gone} herramienta(s)` : ''}\n`)
  process.exit(0)
}

// The prompt the server would build for a real call to that clinic. Asking for
// it rather than rebuilding it here is the whole point: a second copy of this
// mapping would drift, and the clip would be of a Telma nobody sells.
const init = await (
  await fetch(`${BASE}/api/voice/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Sin caller_id a propósito. La consola no trae número de quien llama, y
    // pasarle uno inventado hacía que la base tomase la rama de "ya sabes el
    // teléfono": en la primera grabación cantó "me quedo con el teléfono seis
    // cero cero, uno uno uno, dos dos dos" con total naturalidad, y ese número
    // no era de nadie. Sin él toma la otra rama y lo pregunta, que además es
    // mejor toma: se ve a Telma confirmando el número cifra a cifra.
    body: JSON.stringify({ called_number: NUMBER }),
  })
).json()
const override = init.conversation_config_override?.agent
if (!override?.prompt?.prompt) throw new Error(`init no devolvió prompt: ${JSON.stringify(init).slice(0, 200)}`)

// The live agent's tools and turn-taking, so the recording behaves like the
// product. The fillers are the exception: that list is Portuguese, and a
// Spanish call saying "Deixe ver..." is the accent problem in miniature.
const live = await api(`/convai/agents/${LIVE}`)
const turn = live.conversation_config.turn

// Copies of the five tools, with the clinic written into them.
//
// Each tool takes `clinic_id` from a dynamic variable, and a dynamic variable
// has to be handed over when the conversation opens or the platform refuses to
// start it: "Missing required dynamic variables in tools: {'clinic_id'}". The
// live agent is handed them by the workspace's initiation webhook. This one has
// no webhook on purpose, and placeholders do not count, so without this the
// console can only be made to work by pasting variables by hand every session.
//
// The parameters carry a `constant_value` beside the `dynamic_variable`, so the
// copies pin the value instead of asking for it. They are deleted with the
// agent.
const VALUES = init.dynamic_variables ?? {}
const pin = (node) => {
  if (Array.isArray(node)) return node.forEach(pin)
  if (!node || typeof node !== 'object') return
  const name = node.dynamic_variable
  if (typeof name === 'string' && name && !node.is_system_provided && name in VALUES) {
    node.constant_value = String(VALUES[name])
    node.dynamic_variable = ''
  }
  Object.values(node).forEach(pin)
}

const toolIds = []
for (const id of live.conversation_config.agent.prompt.tool_ids ?? []) {
  const { tool_config } = await api(`/convai/tools/${id}`)
  pin(tool_config)
  tool_config.name = `${tool_config.name}_es`.slice(0, 64)
  const made = await api('/convai/tools', 'POST', { tool_config })
  toolIds.push(made.id ?? made.tool_id)
}

const agent = await api('/convai/agents/create', 'POST', {
  name: `zz-demo-es-${Date.now()}`,
  conversation_config: {
    agent: {
      prompt: {
        prompt: override.prompt.prompt,
        llm: live.conversation_config.agent.prompt.llm,
        // Como el del teléfono. Sin límite se alarga, y una respuesta larga es
        // latencia y es una toma peor.
        max_tokens: live.conversation_config.agent.prompt.max_tokens ?? 300,
        tool_ids: toolIds,
        built_in_tools: live.conversation_config.agent.prompt.built_in_tools,
      },
      first_message: override.first_message,
      language: 'es',
      // No init webhook on this one, so nothing supplies these at run time.
      // The tools read clinic_id and would otherwise have nothing to take.
      dynamic_variables: { dynamic_variable_placeholders: init.dynamic_variables ?? {} },
    },
    tts: { voice_id: VOICE_ES, model_id: MODEL, expressive_mode: EXPRESSIVE },
    turn: {
      ...turn,
      soft_timeout_config: {
        ...turn.soft_timeout_config,
        message: 'Un momento...',
        additional_soft_timeout_messages: ['Déjeme ver...', 'Ahora mismo se lo digo...', 'Un segundo...'],
        use_llm_generated_message: false,
      },
    },
    vad: live.conversation_config.vad,
  },
})

// Las herramientas exigen que estas variables se **entreguen** al abrir la
// conversación. Los placeholders de arriba solo rellenan el texto del prompt:
// sin esto la consola se niega a empezar con "Missing required dynamic
// variables in tools: {'clinic_id'}". En el agente en vivo las entrega el
// webhook de arranque; aquí no hay webhook, así que se pegan a mano una vez,
// en el botón `{} Vars` de la consola.
console.log(`
  Agente de grabación listo.

    id       ${agent.agent_id}
    clínica  ${init.dynamic_variables?.clinic_name}
    voz      Carolina Ruiz (peninsular)
    modelo   ${MODEL}${EXPRESSIVE ? ', expressive mode' : ''}
    prompt   ${override.prompt.prompt.length} caracteres

  Habla y graba aquí, sin tocar nada más:
    https://elevenlabs.io/app/agents/${agent.agent_id}

  Cuando termines:
    node scripts/spanish-demo-agent.mjs --delete ${agent.agent_id}
`)
