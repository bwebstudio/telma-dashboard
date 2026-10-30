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
import { SERVICES, serviceLabel } from '../lib/onboarding/catalog.ts'
import { AGENT_TTS } from '../lib/onboarding/voice-settings.ts'

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

// `let`-like on purpose: the block further down may replace the token with
// the one the live tools already carry. See the comment there.
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
      'Diz-te se a clínica faz o que a pessoa pediu E que horas tem livres, numa só pergunta. Usa isto SEMPRE antes de oferecer qualquer hora: nunca inventes disponibilidade nem decidas por tua conta se a clínica faz uma coisa. Se vier faz=false, a clínica não faz isso: dizes que aqui não se faz, ofereces o que vier em alternativas e não há horas para dar. Se vier faz=true, o campo servico é o nome que usas ao falar e ao registar, nunca as palavras da pessoa. Cada slot traz say (a hora já na hora da clínica, para dizeres em voz alta) e slot_start (identificador em UTC, para devolveres às outras ferramentas, nunca para ler).',
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
          service: {
            type: 'string',
            description:
              'Para que é a consulta, nas palavras da própria pessoa: "lifting", "depilação laser", "uma limpeza". Serve para reservar o tempo certo: há tratamentos que levam quinze minutos e outros que levam uma hora, e as horas que te devolvo já contam com isso. Se ela ainda não disse para que é, pergunta primeiro.',
          },
          professional: {
            type: 'string',
            description:
              'Só quando a pessoa pedir alguém em concreto ("com a doutora Ruiz"). Passa o nome tal como o ouviste. Se não pediu ninguém, deixa isto vazio: eu escolho quem está livre. Nunca leias a lista de nomes em voz alta.',
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
    // A false, ao contrário da consulta de horas. Segurar uma hora é instantâneo
    // e invisível, não há espera nenhuma que encher, e obrigá-la a falar antes
    // foi o que produziu "vou segurar essa hora enquanto confirmamos os seus
    // dados" — que descreve um mecanismo que quem liga não sabe que existe.
    force_pre_tool_speech: false,
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
          service: {
            type: 'string',
            description:
              'Para que é a consulta, nas palavras da própria pessoa: "lifting", "depilação laser", "uma limpeza". Serve para reservar o tempo certo: há tratamentos que levam quinze minutos e outros que levam uma hora, e as horas que te devolvo já contam com isso. O mesmo que passaste a telma_horas_livres.',
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
      'Cancela uma marcação. Só chama isto depois de a pessoa dizer o primeiro e o último nome, e passa-os tal como os ouviste: é o servidor que confere se bate certo com o da marcação. Se responder que não bate, não insistas nem canceles outra: toma o recado.',
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
            description: 'O primeiro e o último nome, tal como a pessoa os disse. Não os corrijas nem os completes.',
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
      'Regista a chamada no painel da clínica. Chama isto UMA ÚNICA VEZ, mesmo no fim, depois de te despedires, e nunca a meio nem depois de cada marcação: uma chamada regista-se uma vez e leva TODAS as marcações que ficaram. Chamar isto duas vezes na mesma conversa duplica a chamada e os minutos. Regista sempre, mesmo que não tenha havido marcação nenhuma.',
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
              // O que a pessoa queria, e não o que se conseguiu fazer. Numa
              // clínica que só toma recados nunca se faz nada: tudo saía como
              // "informacao" e o dia era uma coluna de etiquetas iguais, onde
              // distinguir um cancelamento de uma pergunta de preço obrigava
              // a ler quinze resumos. Ver a migração 0084.
              'O que a pessoa queria, não o que tu fizeste. "pedido_marcacao" se queria uma consulta e ficou o recado; "pedido_cancelamento" se queria desmarcar ou mudar uma e ficou o recado; "urgencia" **só** se descreveu uma das urgências da folha, do género de dor forte, inchaço na cara ou no pescoço, traumatismo, febre alta depois de um procedimento ou sangramento que não pára. **Quem pede para falar com alguém da clínica, ou para ser passado à receção, NÃO é "urgencia"** por o ter pedido: isso leva a etiqueta do recado que é ("pedido_marcacao", "pedido_cancelamento" ou "informacao"), e no resumo escreves que pediu para falar com alguém da clínica. Urgência é o que a pessoa descreve, não o que pede nem a palavra que usa: quem descreve uma urgência **e** quer falar com alguém é "urgencia", pelo que descreveu. Uma coroa que saltou ou um dente lascado, sem mais nada, não são isto: essas ficam no pedido que são, porque o painel pinta a urgência a vermelho e vermelho que não é urgência ensina a receção a não olhar para a cor; "informacao" se foi só uma pergunta e ficou respondida; "marcacao" se ficou mesmo uma marcação na agenda; "cancelamento" se anulaste mesmo uma; "transferida" se passaste a chamada; "nao_resolvida" só quando nem o recado conseguiste tomar.',
          },
          summary: {
            type: 'string',
            description:
              'Duas ou três frases sobre o que a pessoa queria e o que ficou combinado, na língua da clínica. É o que a rececionista vai ler no painel. Inclui SEMPRE o que a pessoa pediu que a clínica faça: que lhe liguem por causa do preço, que confirmem alguma coisa, que falem com alguém, porque isso é trabalho para alguém e perde-se se não ficar escrito. E se a pessoa pediu que lhe liguem para um número DIFERENTE daquele de onde está a ligar, escreve esse número aqui com todos os algarismos, assim: "ligar para 913021212". O painel guarda sozinho o número de onde veio a chamada e mais nenhum: "ligar para o contacto indicado" não indica contacto nenhum e a clínica liga para o número errado.',
          },
          // ── UM CAMPO, PORQUE A PROSA NÃO CHEGOU ─────────────────────────
          // A instrução de escrever o número no resumo foi dada três vezes, em
          // três sítios, e medida: ela escrevia "ligar para o contacto
          // indicado". O número vinha da pessoa, e a base diz-lhe, logo no
          // princípio, para não escrever no painel as palavras da pessoa.
          //
          // Um campo não tem essa ambiguidade. E sabe-se que ela os preenche:
          // sem nenhum para isto, chegou a meter o número numa marcação, numa
          // clínica que não marca, só para o ter onde o pôr.
          // O nome, pela mesma razão que o número de devolução: ela ouve-o,
          // confirma-o, e numa clínica sem agenda não havia campo nenhum onde
          // o pôr. A coluna no painel é a mesma que mostra o nome de um
          // paciente com ficha, por isso a linha deixa de ser um número solto.
          caller_name: {
            type: 'string',
            description:
              'O nome de quem ligou, tal como o confirmaste em voz alta. Escreve-o sempre que o tenhas, mesmo que não haja marcação nenhuma: é o que a clínica lê ao lado do número no painel. Se a pessoa não o disse, **omite este campo**: nunca escrevas "a pessoa", "o senhor", "a senhora" nem nada que não seja um nome, que no painel aparece como se fosse o nome dela.',
          },
          callback_phone: {
            type: 'string',
            description:
              // Diz também o que NÃO se faz, porque os campos que a plataforma
              // preenche sozinha -- from_phone, clinic_id, a duração -- não
              // admitem descrição nenhuma: ou se liga o campo a uma variável
              // ou se lhe escreve uma descrição, nunca as duas. E sem uma
              // palavra que o impeça, o modelo escreve neles: numa chamada
              // verdadeira pôs o número ditado em from_phone, que é deitado
              // fora ao substituir-se a variável, e o número perdeu-se.
              // A condição não é "só se for diferente", que ela não consegue
              // avaliar -- pergunta sempre o número e nunca sabe ao certo se o
              // que lhe deram é o mesmo de onde a chamada veio. A condição é
              // "só se ouviste os algarismos", que é uma coisa que ela sabe.
              //
              // Dizia "escreve-o sempre que o tenhas, seja o mesmo ou outro", e
              // numa chamada verdadeira a pessoa respondeu "é este mesmo", sem
              // ditar nada, e ela escreveu 913021212: um número que ninguém
              // disse e de onde ninguém ligou. Quem compara continua a ser o
              // servidor; o que muda é que um campo vazio é agora a resposta
              // certa, e não um campo por preencher.
              'O número que a pessoa **ditou** para a clínica lhe ligar de volta, com os nove algarismos. **Só escreves aqui um número que já leste de volta em voz alta e que a pessoa confirmou**: um número que entrou mas não foi confirmado é um algarismo trocado à espera de acontecer, e o recado inteiro é a promessa de uma chamada de volta. Se ela não ditou nenhum -- disse que servia o mesmo de onde está a ligar, ou não chegou a dar um --, **omite este campo por completo**: o número de onde a chamada entrou chega sozinho ao painel e é esse que a clínica vê. **Nunca o escrevas de memória nem com algarismos que não ouviste nesta chamada**: um número inventado é uma pessoa a quem a clínica não consegue ligar, e já aconteceu. É aqui e só aqui: o campo from_phone não é para isto e o que lá escreveres é deitado fora.',
          },
          appointments: {
            type: 'array',
            description:
              'Todas as marcações que ficaram nesta chamada. Se a pessoa marcou duas coisas, vão as duas: mandar só uma perde a outra sem aviso. Se não houve marcação nenhuma, omite este campo por completo.',
            items: {
              type: 'object',
              properties: {
              patient_name: { type: 'string', description: 'Nome completo, como o confirmaste.' },
              patient_phone: { type: 'string', description: 'Telefone que confirmaste, em formato internacional.' },
              reason: {
                type: 'string',
                description:
                  'O serviço da agenda desta clínica, escolhido da lista que ela oferece: "Consulta de avaliação", "Limpeza". **Nunca as palavras da pessoa nem nada sobre a saúde dela.** Se ela disse "lifting", escreves o serviço da lista a que isso corresponde, e **se não corresponder a nenhum, esta clínica não faz isso e não devia haver marcação nenhuma**. Isto fica numa base de dados durante meses e não é sítio para o que alguém contou ao telefone sobre o seu corpo.',
              },
              scheduled_at: { type: 'string', description: 'O identificador slot_start da hora marcada, copiado tal e qual. Não é a hora que disseste em voz alta.' },
              professional: {
                type: 'string',
                description:
                  'Com quem ficou a marcação, se a pessoa pediu alguém em concreto. Deixa vazio se não pediu.',
              },
              note: {
                type: 'string',
                description:
                  'O que a clínica precisa de saber sobre ESTA marcação e mais nenhuma. Uma ou duas frases: o que a pessoa pediu para esta consulta e o que alguém tem de fazer antes dela, por exemplo que pediu que lhe liguem por causa do preço. Não descrevas aqui as outras marcações da chamada: cada uma leva a sua, e quem lê esta no dia só quer saber desta.',
              },
              },
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

// ── LAS PALABRAS QUE EL TRANSCRIPTOR NO CONOCE ──────────────────────────────
// `asr.keywords` inclina el reconocimiento hacia una lista de términos, y
// estaba vacía. Importa porque el vocabulario de una clínica no es vocabulario
// corriente: "destartarização" y "criolipólise" no están en el habla de la que
// aprende un transcriptor, y una cita pedida con esa palabra llega escrita como
// otra cosa. Esto es lo que hace que el paso 2 —mirar si la clínica hace eso—
// compare contra lo que la persona dijo de verdad.
//
// Sale del catálogo y no de una lista a mano, para que añadir un servicio en
// lib/onboarding/catalog.ts lo añada también aquí. El corte por longitud es
// tosco a propósito: deja fuera "consulta", "limpeza", "banho", "geral", que el
// transcriptor ya acierta y que sólo diluirían las que importan.
// Palabras corrientes que llegan hasta aquí por ser largas y que el
// transcriptor ya acierta. Cada una que se quede diluye a las que no.
const ASR_ORDINARY = new Set([
  'consulta', 'primeira', 'primera', 'limpieza', 'implantes', 'urgencia', 'urgência',
  'tratamento', 'tratamiento', 'seguimento', 'seguimiento', 'cirurgia', 'análises',
])
const ASR_KEYWORDS = [
  ...new Map(
    Object.values(SERVICES)
      .flat()
      .flatMap((service) => ['pt', 'es'].map((locale) => serviceLabel(service.id, locale)))
      .flatMap((label) => label.split(/[\s/(),.]+/))
      .map((word) => word.trim())
      .filter((word) => word.length >= 8 && !ASR_ORDINARY.has(word.toLowerCase()))
      // Por clave en minúsculas: "Avaliação" y "avaliação" son la misma palabra
      // para quien transcribe, y dos entradas por término gastan la lista.
      .map((word) => [word.toLowerCase(), word])
  ).values(),
]

// The platform's own tools. Configuration of the agent rather than tools we
// host, so they are not in TOOLS above.
//
// Out here rather than inside AGENT_SPEC because AGENT_SPEC is only ever sent
// by --create. Everything written in here reached a brand new agent and none of
// it ever reached the one answering the telephone, which is why the live agent
// has end_call and skip_turn with empty descriptions and transfer_to_number
// switched off.
const BUILT_IN_TOOLS = {
      end_call: {
        name: 'end_call',
        description:
          // ── AS DUAS CONDIÇÕES, AQUI E NÃO NA FOLHA ──────────────────────
          // A folha diz, em três sítios, que se pergunta antes de fechar e que
          // se regista antes de desligar. Media-se em simulação e aguenta; em
          // chamadas verdadeiras não aguentou, e a razão estava escrita aqui:
          // "usa assim que acabares a frase da despedida, sem esperar
          // resposta". A descrição da ferramenta é o que o modelo lê no
          // momento de a usar, e ganha a um parágrafo que leu há dois minutos.
          //
          // ── E A RESPOSTA TEM DE SER UM "NÃO" ────────────────────────────
          // Numa chamada verdadeira perguntou, ouviu "sim, quero passar a
          // consulta para o dia dois", tratou disso e desligou. As três
          // condições estavam cumpridas à letra: perguntou, ouviu, registou.
          // O que faltava era que a resposta fosse um não.
          '**Primeiro: a chamada tem de estar registada com telma_registar_chamada.** Sem isso não usas esta ferramenta, nunca, nem quando a pessoa se despede, nem quando diz que não precisa de nada, nem quando a chamada parece acabada: uma chamada que a clínica paga e de que não fica registo nenhum é a pior coisa que te pode acontecer. Registas primeiro, e só depois desligas.\n**Segundo: o teste é a última coisa que a pessoa disse.** Só podes usar esta ferramenta se a última coisa que ela disse foi NÃO a \"há mais alguma coisa em que possa ajudar?\". Se a última coisa que ela disse foi um número, um nome, um dia, um \"sim\", um \"é esse\" ou um \"está correcto\", **não uses esta ferramenta**: falta a pergunta, e o que fazes a seguir é perguntar. Se a resposta à pergunta foi sim, tratas disso e perguntas outra vez; um \"não\" anterior ao último assunto não conta. Com as duas feitas, dizes a frase da despedida e usas esta ferramenta, sem esperar mais nenhuma resposta. Nunca no mesmo turno em que fazes uma pergunta, nem enquanto a outra pessoa fala.\n**E nunca no mesmo turno em que dizes que fica anotado**: isso é o fim do recado e não uma despedida, e o que vem a seguir é a pergunta do fecho. **No campo system__message_to_speak só vai a despedida**, nunca o \"fica anotado\" e nunca a pergunta do fecho: se o que ias escrever aqui é mais do que \"obrigada por ligar, tenha um bom dia\", então ainda não é hora de desligar. Escrever o recado todo aqui dentro é desligar na cara de quem acabou de confirmar um número.',
      },
      // ── skip_turn: FICA, E COM A DESCRIÇÃO APERTADA ───────────────────
      // Serve para ela ficar calada enquanto a outra pessoa pensa, procura uma
      // data ou fala com alguém ao lado. O que fazia na prática era outra
      // coisa: numa chamada verdadeira a pessoa ditou o número, a Telma chamou
      // esta ferramenta com a razão "a confirmar o número antes de registar" e
      // ficou em silêncio, até a pessoa perguntar "estou?" e, a seguir, porque
      // é que se tinha calado.
      //
      // Foi desligada por isso, e a medição disse que não: sem ela, quatro
      // corridas de quatro acabaram com a chamada desligada logo a seguir a
      // confirmar o número. É a válvula que lhe permite não fazer nada quando
      // ainda falta fazer algo, e sem válvula o que lhe fica à mão é desligar.
      // Volta, com a proibição escrita na descrição.
      //
      // ── E AS DUAS QUE SE PAGARAM NUMA CHAMADA A SÉRIO ─────────────────
      // Um homem a dizer que o doutor o tinha operado, que a coroa saltou e
      // que estava a sangrar. Cortou-a duas vezes a meio da frase, ela
      // recomeçou a mesma frase as duas, e à terceira chamou esta ferramenta
      // com a razão "a pessoa ainda não respondeu; preciso manter a linha".
      // Ficou dezesseis segundos calada, com ele à espera, e foi ele que
      // desligou. Quem foi cortado é quem tem a vez, e numa urgência o
      // silêncio é a clínica a desligar-lhe na cara.
      skip_turn: {
        name: 'skip_turn',
        description:
          'Não digas nada e espera. É para quando a outra pessoa ainda não acabou: está a pensar, a procurar um dado num papel, ou a falar com alguém ao lado. **Nunca a uses depois de a pessoa te responder a uma pergunta tua** -- aí a vez é tua, e ficar calada deixa-a a perguntar "está?" --, nunca para pensares, para confirmares uma coisa contigo ou antes de registares a chamada, e nunca duas vezes seguidas. **Nunca a uses se foste tu a ser cortada a meio de uma frase**: aí a vez é tua e o que falta é acabares a frase, curta. **E nunca numa urgência**, nem quando a pessoa fala de dores, de sangue ou de um problema a acontecer agora: ficar calada a quem está à espera de ti é o que a faz desligar. Se tens algo para dizer ou para fazer, dizes ou fazes.',
      },
      // ── DETEÇÃO DE IDIOMA: DESLIGADA, E DESTA VEZ POR MEDIÇÃO ─────────
      // Esteve desligada, voltou a ser ligada com o argumento de que sem ela
      // os `language_presets` nunca entram, e está desligada outra vez. O
      // argumento era bom e a coisa não funciona: foi experimentada em
      // chamadas a sério e não é de confiança.
      //
      // A avaria conhecida é esta: numa chamada em castelhano a Telma leu em
      // voz alta a palavra "português" — a sua própria saudação a dizer como
      // pedir as outras línguas — e mudou-se a si própria de língua a meio da
      // conversa. Uma regra na base a proibir isso não chega, porque o que
      // decide é o modelo e não a regra.
      //
      // O que há em vez disto: a Telma abre na língua da clínica e a saudação
      // diz como pedir as outras ("for English say English"). Quem liga pede,
      // e aí sim muda. Menos mágico e acerta sempre.
      //
      // `null` e não ausente: esta secção vai por cima do que o agente tem, e
      // uma chave que falta deixa ficar o que lá estava ligado.
      language_detection: null,

      // ── PASSAR A CHAMADA ────────────────────────────────────────────
      // A base diz "passas a chamada" em dois sítios: numa urgência, e numa
      // clínica cuja resposta a "quero falar com alguém" é transferir. O
      // agente não tinha ferramenta nenhuma para o fazer, por isso as duas
      // eram promessas que nada cumpria. Numa chamada real ela disse quatro
      // vezes "ahora mismo le paso con la clínica" a quem descrevia uma
      // possível complicação, e nunca ia acontecer nada. Prometer uma
      // transferência é mau em qualquer sítio e pior aqui, porque a pessoa
      // deixa de procurar ajuda.
      //
      // O destino é uma variável dinâmica e não um número: há um só agente
      // partilhado por todas as clínicas, e é /api/voice/init que manda o
      // número desta chamada. `fallback_number` chega vazio quando a
      // política da clínica não é transferir, e uma transferência sem
      // destino não parte para lado nenhum — que é o que tem de acontecer
      // numa clínica que nunca pediu transferências.
      //
      // `conference` e não `blind`: blind exige que o número tenha entrado
      // pela integração nativa da Twilio, e o nosso não entrou.
      transfer_to_number: {
        name: 'transfer_to_number',
        type: 'system',
        description:
          'Passa a chamada a uma pessoa. Avisas sempre antes de passar. Se não houver número, não passas e não dizes que vais passar.',
        params: {
          system_tool_type: 'transfer_to_number',
          transfers: [
            {
              transfer_destination: { type: 'phone', phone_number: '{{emergency_number}}' },
              transfer_type: 'conference',
              condition:
                'Quem liga descreve uma urgência e a clínica está aberta, ou está fechada mas autorizou receber urgências fora de horas.',
            },
            {
              transfer_destination: { type: 'phone', phone_number: '{{fallback_number}}' },
              transfer_type: 'conference',
              condition:
                'Quem liga pede para falar com uma pessoa da clínica, ou há alguma coisa que a Telma não consegue resolver, e esta clínica transfere chamadas.',
            },
          ],
        },
      },
    }

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
        // A ceiling on one spoken turn, and a backstop rather than a style.
        //
        // It was -1, which is no ceiling at all: asked for every service with
        // every price she read out all six, and a diary with a month free is
        // several hundred hours she would have been equally willing to recite.
        // The prompt now says not to, and a prompt is a request; this is the
        // thing that cannot be talked around by a caller insisting.
        //
        // Three hundred is far above any legitimate turn — the longest thing
        // she ever has to say is a closing that lists two appointments, well
        // under a hundred — so it should never fire in an ordinary call. Set
        // low enough to cut a real sentence, it would truncate her mid-word,
        // which sounds like a fault rather than like brevity.
        max_tokens: 300,
        built_in_tools: BUILT_IN_TOOLS,
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
    //
    // Y hasta hoy tampoco se aplicaba. Este bloque sólo se enviaba con
    // --create, así que todo lo que hay escrito aquí abajo llegaba a un agente
    // recién nacido y nunca al que contesta el teléfono: el que contesta tenía
    // lo que le tocó al nacer, más lo que se tocó a mano en la consola. Ahora
    // se envía en las dos rutas, y esto vuelve a ser lo que dice ser.
    tts: {
      // Todo lo que suena vive en lib/onboarding/voice-settings.ts, para que el
      // "Ouvir" del panel y el teléfono no puedan discrepar. Discreparon: el
      // alta estaba en turbo_v2_5 con stability 0.5 y el teléfono en v3
      // conversational con 0.7 y modo expresivo.
      ...AGENT_TTS,
      // La voz de la lengua base del agente. Las otras van en los presets de
      // abajo, porque cambiar de lengua a media llamada y seguir con la misma
      // voz da una española hablando portugués, que se nota más que el acento
      // que se quería evitar.
      voice_id: env('ELEVENLABS_VOICE_ID_PT') ?? undefined,
    },
    turn: {
      // Cuatro segundos, no siete. Siete es una eternidad al teléfono: quien ha
      // terminado de hablar cree que la línea se ha caído.
      turn_timeout: 4.0,
      // Forty-five seconds of nothing, and the line closes.
      //
      // The platform default never closes it, and ElevenLabs' own agent behaves
      // the same way: right for them, because an abandoned browser tab costs
      // nobody anything. An abandoned telephone line bills the clinic for as
      // long as it stays open, and somebody putting the handset on the counter
      // to look for a diary and forgetting is not a rare event.
      //
      // Long enough to hunt for a calendar, short enough not to fund a dead
      // line. The base asks once whether they are still there before it gets
      // here; this is what happens when nobody is.
      //
      // El agente en vivo está en 75, que es donde nació. Esta línea gana:
      // treinta segundos de línea muerta por llamada abandonada los paga la
      // clínica, y el argumento de arriba no ha dejado de ser cierto.
      silence_end_call_timeout: 45.0,
      // `eager` cierra el turno en cuanto la frase suena terminada, en vez de
      // esperar a que el silencio lo confirme. Sería la única palanca contra el
      // ruido de sala: la plataforma no expone un umbral de VAD, sólo el
      // interruptor de voces de fondo, y en una habitación con un bebé eso no
      // basta.
      //
      // Pero el riesgo es cortar a quien hace una pausa a media frase, y el
      // agente en vivo lleva semanas en `normal` sin que nadie se queje de
      // ruido. Esta línea decía `eager` y nunca llegó a aplicarse, así que
      // nunca se midió. Se queda en lo que está probado; cambiarlo es un
      // experimento con su propia medición, no un valor por defecto.
      turn_eagerness: 'normal',
      // Apagado: genera antes de que el interlocutor termine y luego continúa, y
      // las dos generaciones se cosen con una costura audible.
      speculative_turn: false,
      // El relleno mientras espera una herramienta lo pone la plataforma. Pedirlo
      // en el prompt le hacía hablar dos veces por cada consulta.
      //
      // Y lo escribe esta lista, no el modelo. Con
      // `use_llm_generated_message` la muletilla se genera en cada espera, y se
      // generaba en el idioma que le apeteciera: "a ver" (español) dos veces en
      // una llamada en portugués, y "Позвольте" (ruso) en otra, dicho en voz
      // alta por el altavoz. No era la detección de idioma, que lleva semanas
      // apagada, ni el tamaño del modelo: era esto. Cuatro frases escritas a
      // mano y `randomize_fillers` dan la variedad que se buscaba al
      // encenderlo, sin que haya un idioma que elegir.
      soft_timeout_config: {
        // Cinco segundos, e o número deixa de andar de um lado para o outro
        // porque o princípio passa a estar escrito: **isto só existe para uma
        // espera que quem liga não consegue explicar.**
        //
        // Esteve em 3, subiu a 4.5 e a 6 para não pisar a frase da Telma,
        // desceu outra vez a 3 quando havia nove segundos de silêncio antes da
        // primeira palavra. Esses nove segundos eram o `start_procedure`, e
        // desapareceram quando a marcação e a despedida voltaram ao núcleo
        // (f72894f). O silêncio que isto tapava já não existe.
        //
        // As esperas que restam anuncia-as ela própria: `force_pre_tool_speech`
        // está ligado na agenda e na reserva, e é ela quem diz "só um momento,
        // que vou ver a disponibilidade". O registo da chamada não o tem, de
        // propósito, porque é invisível — e foi aí que a três segundos saiu um
        // "Deixe ver..." colado à frente de uma boa notícia.
        //
        // Cinco é mais longo do que qualquer geração normal e mais curto do que
        // uma avaria. Se voltar a aparecer onde não faz falta, o que está
        // errado é a ferramenta que a provoca, não este número.
        timeout_seconds: 5,
        // "Já lhe digo..." saiu daqui. Promete uma resposta a uma pergunta,
        // e a plataforma di-lo sempre que uma geração demora — incluindo antes
        // de registar a chamada e antes de se despedir, onde não há pergunta
        // nenhuma pendente. Numa chamada real saiu três vezes, duas delas sem
        // sentido. As que ficam são hesitações e não promessas.
        message: 'Deixe ver...',
        // "Pronto..." saiu. Ouviu-se no fim de uma chamada, antes da
        // despedida, e "pronto" sozinho não é uma hesitação: é o que se diz
        // quando algo acabou, dito antes de acabar.
        additional_soft_timeout_messages: ['Um momento...', 'Ora bem...'],
        use_llm_generated_message: false,
        randomize_fillers: true,
        max_soft_timeouts_per_generation: 4,
      },
    },
    // Distingue la voz de quien llama de la tele, de un bebé o de alguien más
    // en la sala.
    vad: { background_voice_detection: true },
    asr: { keywords: ASR_KEYWORDS },
    // ── UNA VOZ POR IDIOMA ──────────────────────────────────────────────────
    // Sin esto el agente tiene una sola voz y habla inglés con acento
    // portugués. Se oyó en una llamada de verdad, y el agente de la demostración
    // llevaba meses así: estas líneas estaban escritas y este script nunca había
    // corrido contra él, de modo que el trabajo estaba hecho y no estaba puesto.
    //
    // Van en `conversation_config.language_presets`, hermanas de `tts`, no
    // dentro de `agent`. Puestas dentro de `agent` la API responde 200 y las
    // tira, que es la peor forma de fallar: parece que fue.
    //
    // El catalán no está en la lista que acepta ElevenLabs, aunque lo ofrezcamos
    // en el alta. Ver a memória do projecto.
    language_presets: {
      es: { overrides: { tts: { voice_id: env('ELEVENLABS_VOICE_ID_ES') ?? undefined } } },
      // El inglés no lleva voz propia, y es una decisión, no un olvido. Se
      // probó una voz inglesa y no gustó: prefieren la de siempre aunque lea el
      // inglés con acento portugués, porque es la voz que la clínica reconoce
      // como la suya.
      //
      // Pero la entrada tiene que estar, aunque vaya vacía: las claves de
      // `language_presets` son la lista de lenguas que el agente atiende, así
      // que sin ella el inglés no es que suene con otra voz, es que no existe.
      // Y como esta sección se reemplaza entera en cada envío, un inglés
      // añadido sólo en la consola dura hasta la próxima ejecución.
      en: { overrides: {} },
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

// ── O token que já lá está ganha ao token que temos à mão ───────────────────
// Este script reescreve a ferramenta inteira, cabeçalho de autorização
// incluído. O token não é um só: a demonstração corre no Vercel com o seu, o
// .env.local de quem desenvolve tem outro, e uma correria deste script a partir
// de uma máquina qualquer trocava o da demonstração pelo de casa. Nada falhava
// aqui: falhava depois, em cada chamada, com 401 em todas as ferramentas e a
// Telma a dizer que não conseguia consultar a agenda.
//
// Por isso, quando as ferramentas já existem e trazem um token diferente do
// nosso, é o delas que vale. Trocá-lo é uma decisão explícita e pede --token.
{
  const live = [...byName.entries()]
    .filter(([name]) => name.startsWith('telma_') && name.endsWith(SUFFIX))
    .map(([, t]) => (t.tool_config?.api_schema?.request_headers ?? {}).Authorization)
    .find((v) => typeof v === 'string' && v.startsWith('Bearer '))
  const liveToken = live?.slice('Bearer '.length).trim()
  if (liveToken && liveToken !== TOKEN) {
    if (flag('token')) {
      console.log('  aviso: o token dado difere do que as ferramentas têm. Vai ser trocado.\n')
    } else {
      console.log('  token: mantido o que as ferramentas já tinham (use --token para trocar)\n')
      auth.Authorization = `Bearer ${liveToken}`
    }
  }
}

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
  // La unión menos las nuestras que ya no existen.
  //
  // Esto sólo sumaba. Cuando telma_verificar_servico se fundió con la agenda,
  // la herramienta siguió colgada del agente: el modelo leía su descripción en
  // cada turno y podía llamarla, contra un prompt que ya no la nombraba. Una
  // herramienta que nadie retira es una herramienta que se queda.
  //
  // Sólo se sueltan las que llevan nuestro prefijo y no están en TOOLS. Una que
  // alguien haya añadido a mano en la consola no se toca: este script no la
  // creó y no le toca decidir sobre ella.
  const ours = new Set(TOOLS.map((t) => `${t.name}${SUFFIX}`))
  const byId = new Map((existing.tools ?? []).map((t) => [t.id ?? t.tool_id, t.tool_config?.name ?? t.name]))
  const stale = (prompt.tool_ids ?? []).filter((id) => {
    const name = byId.get(id)
    return name?.startsWith('telma_') && name.endsWith(SUFFIX) && !ours.has(name)
  })
  const merged = [...new Set([...(prompt.tool_ids ?? []), ...ids])].filter((id) => !stale.includes(id))
  if (stale.length) {
    console.log(`  soltadas do agente: ${stale.map((id) => byId.get(id)).join(', ')}`)
  }

  // A partial patch, but `tts`, `turn`, `vad`, `asr` and `language_presets` are
  // all sent, from AGENT_SPEC. This comment used to say the opposite -- that
  // they were left out so a voice chosen in the console would survive -- and it
  // was read and believed while the lines below did the other thing. Anything
  // picked by hand in those sections is overwritten by a run of this script,
  // which is the point: what Telma sounds like is decided in
  // lib/onboarding/voice-settings.ts, not in a browser tab.
  //
  // `language_presets` is replaced whole, so a language added in the console and
  // not added here disappears on the next run. Add it in AGENT_SPEC.
  //
  // Run this rather than the console when the console refuses to publish. Its
  // form now rejects `{{emergency_number}}` in transfer_to_number -- it allows
  // only alphanumerics, `+` and `*` -- and that blocks publishing anything at
  // all, including an unrelated change. The API accepts the same payload.
  //
  // The built-ins go on top of what the agent has rather than instead of it, so
  // one somebody switched on in the console is not switched off by a run of
  // this.
  const builtIns = { ...(prompt.built_in_tools ?? {}), ...BUILT_IN_TOOLS }
  const spec = AGENT_SPEC.conversation_config
  await api(`/convai/agents/${AGENT}`, 'PATCH', {
    conversation_config: {
      agent: { prompt: { ...prompt, tool_ids: merged, built_in_tools: builtIns } },
      // La voz, los turnos y las muletillas, que hasta ahora sólo existían para
      // un agente recién creado. El prompt de reserva no se toca aquí: vive en
      // AGENT_SPEC.conversation_config.agent.prompt.prompt y lo pisaría el
      // spread de arriba, que es el del agente y es el que vale.
      tts: spec.tts,
      turn: spec.turn,
      vad: spec.vad,
      asr: { ...(agent?.conversation_config?.asr ?? {}), ...spec.asr },
      language_presets: spec.language_presets,
    },
  })
  console.log(`\n  ligadas ao agente ${AGENT}: ${merged.length} ferramentas`)
  console.log(
    `  ferramentas da plataforma: ${Object.entries(builtIns)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ')}`
  )

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
