#!/usr/bin/env node
//
// A whole conversation, against the real briefing, without a telephone.
//
//   node --experimental-strip-types scripts/simulate-call.mjs scripts/scenarios/emergencia.mjs
//
// ElevenLabs will simulate a caller against an agent and score the result. What
// it will not do is take a prompt as an argument: `simulate-conversation`
// always uses whatever is stored on the agent, and passes over an override in
// the body without a word. The first run of this looked fine and was testing
// the agent's emergency fallback prompt, not ours.
//
// So a throwaway agent is created from the prompt this codebase generates, the
// conversation is run against that, and the agent is deleted afterwards. The
// live agents are never touched, which matters: one of them answers the demo.
//
// ── WHAT THIS DOES NOT COVER ───────────────────────────────────────────────
// Audio, and everything that comes with it: what the microphone mishears, what
// happens when somebody interrupts, silences, background noise, and the tone
// Telma is actually heard in. This is the words and the order they come in.
// Tools are not attached either, so anything that needs the diary is out of
// scope here; that is what scripts/test-agenda.mjs is for.

import { readFileSync } from 'node:fs'
import { AGENT_TTS } from '../lib/onboarding/voice-settings.ts'

const KEY = env('ELEVENLABS_API_KEY')
if (!KEY) fail('ELEVENLABS_API_KEY não encontrada.')

// Runs the same call N times against one throwaway agent.
//
// A single verdict is not a result. The same conversation passed a criterion on
// one run and failed it on the next, in both directions, which means every
// pass/fail read off one simulation in this file's history was worth less than
// it looked. What a rule is worth is how often it is obeyed.
const RUNS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7)) || 1)

// Which model answers. Hardcoded until now, which made "is the model the
// problem?" a question nobody could answer without editing this file, and an
// answer nobody could reproduce afterwards. The default is what the live
// agents run, so an unflagged run still measures the product.
const LLM = process.argv.find((a) => a.startsWith('--llm='))?.slice(6) || 'gpt-5.4-mini'

// Whether to run the shape that is actually in production.
//
// Since 772c0df the live agent carries the booking, the cancellations, the
// goodbye and the difficult calls as procedures, and /api/voice/init sends only
// the core. Neither of the two shapes this file could already run is that one:
// the default sends the whole sheet, and `nodes` builds a workflow graph, which
// was measured in e5a4f7e and is not what shipped.
//
// So every number this harness has produced since then has been about a
// configuration nobody is running. This flag makes the throwaway agent the same
// shape as the real one: core in the prompt, the four procedures on the agent,
// each behind the trigger that decides when it loads.
const PROCEDURES = process.argv.includes('--procedures')

// ── THE SAME SCENARIO, IN WRITING ──────────────────────────────────────────
// `--whatsapp` builds the sheet with `channel: 'whatsapp'`, which drops the
// half of it that is about speech and adds the section that says so.
//
// It costs nothing to have: this harness has always been text. It never makes
// audio -- the platform simulates a caller against the agent and hands back a
// transcript -- so running the written sheet through it is the written sheet,
// answered by the same model the telephone uses, with the ElevenLabs key we
// already pay for. No OpenAI account, no WhatsApp number, no migration.
//
// What it is not is the production path. In production the brain is ours
// (lib/whatsapp-brain), because a WhatsApp thread is turns separated by hours
// and ElevenLabs has no way to take one over HTTP or resume a conversation by
// its id. So this previews the sheet and the model, which is where the
// behaviour comes from, and not our loop around them.
const WHATSAPP = process.argv.includes('--whatsapp')

// The platform stops a simulation at about thirty agent turns and returns what
// it has, mid-sentence, mid-tool-call, with no flag saying so. Three of twelve
// runs in one measurement had been cut like that and were scored anyway, and a
// criterion about how a call ends cannot be judged on a call that never ended.
// Raised, and a run that reaches it is thrown away rather than counted.
const MAX_TURNS = 45

const scenarioPath = process.argv[2]
if (!scenarioPath) fail('Uso: simulate-call.mjs <ficheiro de cenário>')

const scenario = await import(new URL(`../${scenarioPath}`, import.meta.url).href)
const {
  clinic,
  caller,
  firstMessage,
  criteria,
  language = 'es',
  guardrails,
  nodes,
  tools,
  toolMocks,
  dynamicVariables,
  // ── OS PROCEDIMENTOS NÃO SAEM DA MESMA CLÍNICA ───────────────────────────
  // No agente verdadeiro os procedimentos são configuração: um texto só,
  // partilhado por todas as clínicas, cortado de uma clínica de referência que
  // marca (ver scripts/elevenlabs-procedures.mjs). O núcleo é que vem da
  // clínica desta chamada.
  //
  // Enquanto este ficheiro cortava os dois da mesma clínica, um cenário de uma
  // clínica sem agenda corria com um procedimento de cancelamentos escrito
  // para uma clínica sem agenda -- que não existe em lado nenhum -- e media
  // uma configuração que ninguém tem. O caso que interessa é precisamente o
  // outro: o núcleo diz que não há agenda e o procedimento diz para a
  // consultar. É nessa contradição que uma paciente ouviu "não encontro
  // nenhuma marcação nesse número".
  proceduresFrom,
} = scenario.default

const { buildPrompt, greetingLine, todayInZone } = await import('../lib/onboarding/prompt.ts')
const variables = {
  ...clinic,
  today: todayInZone(clinic.timezone, language),
  ...(WHATSAPP ? { channel: 'whatsapp' } : {}),
}
const built = buildPrompt(variables, language)
// The agent's procedures, cut from whichever clinic the scenario says they are
// cut from in production. Same clinic unless it says otherwise.
const builtProcedures = proceduresFrom
  ? buildPrompt({ ...proceduresFrom, today: variables.today }, language)
  : built
const greeting = greetingLine(clinic.clinic_name, language, clinic.formality, clinic.recording, [
  language,
])

console.log(`\n  cenário: ${scenarioPath}${WHATSAPP ? '  (por escrito)' : ''}`)
if (nodes) {
  const n = built.nodes
  console.log(`  núcleo:  ${n.core.length + n.closing.length} caracteres`)
  console.log(`  nós:     reservar ${n.booking.length}, cancelar ${n.cancelling.length}`)
  console.log(`  a mais:  ${n.core.length + n.closing.length + n.booking.length} numa marcação, contra ${built.text.length} sem nós\n`)
} else if (PROCEDURES) {
  const n = built.nodes
  const tok = (t) => Math.round(t.length / 3.4)
  console.log(`  forma:   como produção — núcleo no prompt, procedimentos no agente`)
  console.log(`  núcleo:  ${tok(n.core)} tokens`)
  console.log(`  procs:   cancelar ${tok(n.cancelling)}, difícil ${tok(n.difficult)}`)
  console.log(`  numa marcação: ${tok(n.core)} sem voltas a mais, contra ${tok(built.text)} com a folha inteira\n`)
} else {
  console.log(`  prompt:  ${built.text.length} caracteres, versão ${built.version}\n`)
}

// With `nodes`, the agent carries only the core and the procedures hang off it
// as nodes the conversation walks into. `additional_prompt` adds to the core
// rather than replacing it, which is what keeps her the same person inside a
// node: only the procedure changes, not who is following it.
//
// Emergencies and the closing stay in the core deliberately. A node has to be
// reached, and the two things that must work when nothing else does are the
// two you cannot afford to have behind a door.
const WORKFLOW = nodes
  ? {
      nodes: {
        start_node: { type: 'start', position: { x: 0, y: 0 }, edge_order: ['to_book', 'to_cancel'] },
        reservar: {
          type: 'override_agent',
          label: 'Reservar',
          position: { x: 260, y: -120 },
          additional_prompt: built.nodes.booking,
          edge_order: [],
        },
        cancelar: {
          type: 'override_agent',
          label: 'Cancelar',
          position: { x: 260, y: 120 },
          additional_prompt: built.nodes.cancelling,
          edge_order: ['cancel_to_book'],
        },
      },
      edges: {
        to_book: {
          source: 'start_node',
          target: 'reservar',
          forward_condition: { type: 'llm', condition: 'A pessoa quer marcar uma consulta, ou mudar uma marcação para outra hora.' },
        },
        to_cancel: {
          source: 'start_node',
          target: 'cancelar',
          forward_condition: { type: 'llm', condition: 'A pessoa quer anular uma marcação que já tem.' },
        },
        // One call, two jobs. The platform treats a pair of nodes as one edge
        // whichever way you draw it — two edges between the same two nodes is
        // rejected as a duplicate — so the way back is a condition on the same
        // edge rather than an edge of its own.
        //
        // This crossing is where "does not ask for the details twice" either
        // survives or does not, and it is the whole reason the first test after
        // splitting is Carlos.
        cancel_to_book: {
          source: 'cancelar',
          target: 'reservar',
          forward_condition: { type: 'llm', condition: 'Depois de anular, a pessoa quer também marcar uma consulta.' },
          backward_condition: { type: 'llm', condition: 'Depois de marcar, a pessoa quer também anular uma marcação.' },
        },
      },
      prevent_subagent_loops: false,
    }
  : null

// ── E AS FERRAMENTAS DO SISTEMA COMO ESTÃO NO AGENTE VERDADEIRO ────────────
// `end_call` e `skip_turn` levam uma descrição nossa, e é essa descrição que o
// modelo lê no momento de desligar ou de se calar -- ganha a um parágrafo da
// folha lido há dois minutos, o que é precisamente por que estão escritas.
// Aqui não estavam, por isso o agente de simulação corria com as descrições
// por omissão da plataforma ("usa assim que acabares a despedida") e media uma
// Telma mais apressada do que a que atende o telefone: "despediu-se sem voltar
// a perguntar" falhava aqui e não falhava lá.
//
// Lidas do agente em vivo em vez de copiadas para cá, porque uma segunda cópia
// é uma cópia que se desencontra.
const LIVE_AGENT = 'agent_9701kzp690x6fnaba03rmp81kt9a'
let liveBuiltIns = await api('GET', `/v1/convai/agents/${LIVE_AGENT}`)
  .then((a) => a?.conversation_config?.agent?.prompt?.built_in_tools ?? null)
  .catch(() => null)
if (!liveBuiltIns) {
  console.log('  aviso: não se leram as ferramentas do sistema do agente em vivo')
}

// ── E POR ESCRITO NÃO EXISTEM ──────────────────────────────────────────────
// `end_call` e `skip_turn` são as duas do telefone. A nossa cabeça de texto
// (lib/whatsapp-tools) não tem nenhuma delas, e não por esquecimento: não há
// chamada para desligar, e um turno para passar não quer dizer nada numa
// conversa em que o turno seguinte pode chegar daqui a três horas.
//
// Deixá-las aqui media uma Telma que não existe, e mediu: na primeira
// passagem deste cenário ela chamou `skip_turn` nove vezes à espera de uma
// agenda que nunca consultou, e o relógio que em produção não há foi o que
// tapou o problema a sério -- a mensagem que anuncia e nunca volta.
if (WHATSAPP && liveBuiltIns) {
  // Nulas, e não removidas: é assim que a plataforma escreve uma ferramenta de
  // sistema desligada, e todas as outras já lá estão nulas.
  liveBuiltIns = { ...liveBuiltIns, end_call: null, skip_turn: null }
}

const agent = await api('POST', '/v1/convai/agents/create', {
  name: `zz-simulacao-${Date.now()}`,
  conversation_config: {
    agent: {
      prompt: {
        // Only the core when running as a graph: the procedures arrive with
        // the node.
        prompt: PROCEDURES
          ? built.nodes.core
          : nodes
            ? `${built.nodes.core}\n\n${built.nodes.closing}`
            : built.text,
        llm: LLM,
        max_tokens: 300,
        ...(tools ? { tool_ids: tools } : {}),
        ...(liveBuiltIns ? { built_in_tools: liveBuiltIns } : {}),
      },
      // ── QUEM FALA PRIMEIRO ─────────────────────────────────────────────
      // Ao telefone é ela: atende, e o cumprimento é a primeira coisa que se
      // ouve. Por escrito é a pessoa, sempre -- uma conversa de WhatsApp
      // começa porque alguém escreveu, e a Telma nunca abre uma. Deixar aqui o
      // cumprimento falado punha-a a dizer "Fala a Telma" numa mensagem, e
      // media uma conversa que em produção não existe.
      //
      // Vazio, a plataforma espera pela primeira linha do paciente, e a
      // apresentação cai onde cai a sério: na primeira resposta dela, que é o
      // que a folha manda fazer por escrito.
      first_message: WHATSAPP ? '' : greeting,
      language,
    },
    // Required for any agent that is not in English, and the same model the
    // live agents run. A simulation on a different voice model would be a
    // simulation of a product we do not sell, which is what this had become:
    // the string here said turbo_v2_5 long after the telephone moved to v4,
    // and the comment above went on claiming they matched. Read from the one
    // file that decides, so there is nowhere left for the two to disagree.
    tts: { model_id: AGENT_TTS.model_id },
  },
  // Platform-level guardrails, when a scenario asks for them. Worth being able
  // to run the same conversation with and without: prompt_injection has an
  // on/off switch and no logging mode, and the action for a triggered content
  // guardrail is end_call. Turning it on blind means finding out whether it
  // hangs up on real patients by hanging up on real patients.
  ...(guardrails ? { platform_settings: { guardrails } } : {}),
  ...(WORKFLOW ? { workflow: WORKFLOW } : {}),
})

// The same four pieces the live agent carries, with the same triggers, on a
// branch of a throwaway agent. Written out here rather than imported from
// scripts/elevenlabs-procedures.mjs because that script talks to the real
// agent and is not a module: what has to match between them is the text, and
// the text comes from buildPrompt in both.
if (PROCEDURES) {
  // No booking: since the timing on conv_9301m3jj2s6w it lives in the core,
  // because `start_procedure` costs a round trip and booking is the common
  // path. Keep this list the same as the one in elevenlabs-procedures.mjs or
  // the harness measures a shape nobody runs, which is the mistake 451bff4
  // exists to stop repeating.
  // Vazio, e é esse o ponto: desde que os cancelamentos e a chamada difícil
  // voltaram para o núcleo, o agente verdadeiro não tem procedimento nenhum.
  // A bandeira fica porque é ela que diz "corre na forma que está em
  // produção", e a forma que está em produção é esta. Pô-los aqui outra vez
  // seria medir um agente que ninguém tem -- que é o erro que esta bandeira
  // existe para não repetir.
  const pieces = []
  const branch = (await api('GET', `/v1/convai/agents/${agent.agent_id}/branches`)).results.find(
    (b) => !b.is_archived
  )
  for (const [slug, node, trigger] of pieces) {
    const { procedure_id } = await api(
      'POST',
      `/v1/convai/agents/${agent.agent_id}/branches/${branch.id}/procedures`,
      {}
    )
    await api(
      'PATCH',
      `/v1/convai/agents/${agent.agent_id}/branches/${branch.id}/procedures/${procedure_id}/draft`,
      { name: `telma/${slug}`, type: 'free_form', trigger, content: builtProcedures.nodes[node] }
    )
  }
  // Out of draft. A procedure left in draft is written and never read, and the
  // simulation would quietly measure an agent with no booking instructions.
  await api('PATCH', `/v1/convai/agents/${agent.agent_id}?branch_id=${branch.id}`, {
    name: agent.name,
  })
  console.log(`  núcleo inteiro, sem procedimentos — como o agente verdadeiro\n`)
}

try {
  const tally = new Map()
  let truncated = 0

  for (let run = 1; run <= RUNS; run++) {
    const result = await api(
      'POST',
      `/v1/convai/agents/${agent.agent_id}/simulate-conversation`,
      {
        simulation_specification: {
          simulated_user_config: {
            prompt: { prompt: caller },
            first_message: firstMessage,
            language,
          },
          ...(dynamicVariables ? { dynamic_variables: dynamicVariables } : {}),
          // Faked, so a scenario about keeping track of two bookings is not
          // also a test of the demo's database, and so it writes nothing to it.
          // The platform wants each return value as a string, not an object.
          ...(toolMocks
            ? {
                tool_mock_config: Object.fromEntries(
                  Object.entries(toolMocks).map(([name, value]) => [
                    name,
                    { default_return_value: JSON.stringify(value) },
                  ])
                ),
              }
            : {}),
        },
        extra_evaluation_criteria: criteria,
        max_turns: MAX_TURNS,
      }
    )

    // Everything up to the caller hanging up. After that the simulator keeps
    // going anyway: it does not honour its own END_CALL marker, the caller
    // repeats it, and Telma answers each one by registering the call again,
    // until the turn limit. That loop is not Telma being long-winded and not
    // the caller going round in circles, and counting it made a thirteen-turn
    // conversation look like thirty-one. A real telephone hangs up.
    //
    // It does say something true about production, though: she will re-register
    // a call given the chance, which is why the webhook is idempotent on the
    // conversation id.
    const all = result.simulated_conversation ?? []
    const hungUp = all.findIndex((t) => (t.message ?? '').includes('END_CALL'))
    const spoken = hungUp === -1 ? all : all.slice(0, hungUp)
    const turns = spoken.filter((t) => t.role === 'agent').length
    if (turns >= MAX_TURNS) {
      truncated++
      continue
    }

    // Only the last transcript is printed. Five of them is not reading, and the
    // numbers underneath are what the run is for.
    if (run === RUNS) {
      for (const turn of spoken) {
        const who = turn.role === 'agent' ? 'TELMA' : 'PESSOA'
        const said = (turn.message ?? '').trim()
        if (said) console.log(`  ${who} | ${wrap(said)}\n`)
        for (const call of turn.tool_calls ?? []) {
          // Com o que lhe foi passado, cortado. O nome sozinho não chega:
          // metade do que se mede aqui é o que ela escreveu no recado, e isso
          // só está nos parâmetros -- um número ditado que não lá está, ou um
          // +351000000000 inventado para encher o campo.
          const args = call.params_as_json ?? JSON.stringify(call.tool_details ?? {})
          console.log(`        > ${call.tool_name ?? call.name}  ${String(args).slice(0, 300)}\n`)
        }
      }
    }

    for (const [id, r] of Object.entries(result.analysis?.evaluation_criteria_results ?? {})) {
      const seen = tally.get(id) ?? { ok: 0, n: 0, why: '' }
      seen.n++
      if (r.result === 'success') seen.ok++
      else seen.why = r.rationale ?? ''
      tally.set(id, seen)
    }
  }

  const valid = RUNS - truncated
  console.log(`  ── critérios, ${valid} de ${RUNS} passagens válidas ──────────────`)
  if (truncated) console.log(`     ${truncated} cortada(s) no limite de turnos, fora da conta\n`)

  // A threshold per criterion, not one for all of them. A rule about where an
  // emergency goes at 19 in 20 is a failure; a rule about how warmly she says
  // goodbye at 8 in 10 is a Tuesday. Defaults to 0.8 when a scenario says
  // nothing, so leaving it out is a claim about quality, never about safety.
  let below = 0
  for (const [id, { ok, n, why }] of tally) {
    const wanted = criteria.find((c) => c.id === id)?.threshold ?? 0.8
    const rate = n ? ok / n : 0
    const good = rate >= wanted
    if (!good) below++
    const bar = '█'.repeat(ok) + '·'.repeat(Math.max(0, n - ok))
    console.log(
      `  ${good ? ' ' : '!'} ${String(ok).padStart(2)}/${n} ${bar.padEnd(Math.max(n, 5))} ` +
        `${id.padEnd(26)} exige ${Math.round(wanted * 100)}%`
    )
    if (!good && why) console.log(`        ${wrap(why, 8)}`)
  }
  console.log(
    `\n  ${below === 0 ? 'todos os critérios chegam ao seu limiar' : `${below} critério(s) abaixo do limiar`}\n`
  )
  process.exitCode = below === 0 ? 0 : 1
} catch (e) {
  console.error(`\n  ${e.message}\n`)
  process.exitCode = 1
} finally {
  // Always, including after a failure. A simulation agent left behind is one
  // more thing in a list where every other entry answers a real telephone.
  await api('DELETE', `/v1/convai/agents/${agent.agent_id}`).catch(() => {})
}

// ---------------------------------------------------------------------------

async function api(method, path, body, attempt = 1) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()

  // A 500 from the far end used to take the whole run down, and it happened
  // twice in one afternoon: six simulated calls thrown away because the last
  // one crashed on their side. Retried three times, widening, because the
  // alternative is a measurement that silently reports nothing and gets read
  // as "no findings". Only for their faults — a 4xx is ours and stays fatal.
  if (res.status >= 500 && attempt <= 3) {
    console.log(`  ${res.status} de ElevenLabs, tentativa ${attempt} de 3...`)
    await new Promise((r) => setTimeout(r, attempt * 4000))
    return api(method, path, body, attempt + 1)
  }

  // Thrown, never process.exit(). Exiting here skipped the `finally` that
  // deletes the throwaway agent, so a rate limit mid-run left one behind in a
  // list where every other entry answers a real telephone. Which is exactly
  // what happened, twice, before anybody looked at the list.
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n  ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

function wrap(text, indent = 8) {
  const width = 88
  const pad = ' '.repeat(indent) + '| '
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim())
      line = w
    } else line += ' ' + w
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join(`\n${pad}`)
}

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

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}
