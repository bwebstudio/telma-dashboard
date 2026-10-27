/**
 * The same five tools the telephone has, for a model of our own.
 *
 * ── WHY THEY ARE DECLARED TWICE AND CALLED ONCE ────────────────────────────
 * The endpoints are the endpoints: /api/availability, /api/appointments and
 * /api/webhook/call are what the voice platform calls and what this calls, with
 * the same token and the same rules. Nothing about a booking is decided twice.
 *
 * What exists twice is the *declaration*: ElevenLabs holds its own copy of
 * these schemas on the agent, written by scripts/elevenlabs-wire-tools.mjs,
 * because that is where the voice model reads them. A model we call ourselves
 * needs them in its own format, in the request. The two have to say the same
 * thing, and the honest way to keep that true is that they are both short,
 * both here in the repository, and both pointed at by this comment. The
 * descriptions below are deliberately shorter than the voice ones: the long
 * ones exist to stop a *spoken* mistake, and half of what they say is about
 * speech.
 *
 * ── AND WHY THERE IS NO SIXTH ──────────────────────────────────────────────
 * `telma_passar_chamada` is not here. You cannot put a WhatsApp thread through
 * to a person: there is no call to move. A clinic whose answer to "I want to
 * speak to somebody" is a transfer gets, in writing, the other answer it
 * already has -- the message, and somebody rings back.
 */

export interface ToolContext {
  clinicId: string
  /** The patient's number, which the platform injects on a call and the
   *  message carries here. */
  fromPhone: string
  /** The thread's own reference. It goes where the voice tools put the
   *  conversation id, so `record_call` upserts on the thread and a
   *  conversation that files twice is still one row and one charge. */
  callRef: string
  /** Where our own endpoints are. The tools are called over HTTP rather than
   *  in process, so that there is one door, one token and one set of rules for
   *  both channels. */
  baseUrl: string
  token: string
}

/** The OpenAI function-calling shape, which is what every model we might use
 *  accepts today. Only the fields the model fills: the rest are injected. */
export const TEXT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'telma_horas_livres',
      description:
        'Diz se a clínica faz o que a pessoa pediu E que horas tem livres. Usa sempre antes de oferecer uma hora. Se vier faz=false, a clínica não faz isso e não há horas para dar. Cada hora traz say (para escrever) e slot_start (identificador, para devolver às outras ferramentas).',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'As palavras da pessoa, tal como as escreveu.' },
          date: { type: 'string', description: 'AAAA-MM-DD, quando pediu um dia certo.' },
          days: { type: 'integer', description: 'Quantos dias procurar, até sete. Usa 7 se não pediu dia.' },
          professional: { type: 'string', description: 'Só se pediu alguém em concreto.' },
        },
        required: ['service'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telma_reservar_hora',
      description:
        'Segura uma hora enquanto confirmas os dados. Chama assim que a pessoa escolher uma, com o slot_start tal como veio.',
      parameters: {
        type: 'object',
        properties: {
          slot_start: { type: 'string', description: 'O identificador da hora, tal como veio.' },
          service: { type: 'string', description: 'O serviço, como o devolveu a agenda.' },
        },
        required: ['slot_start'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telma_ver_marcacoes',
      description:
        'O que está marcado num número, sem devolver o nome. Usa antes de anular ou mudar.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'O número de quem escreve, com os nove algarismos.' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telma_cancelar_marcacao',
      description:
        'Anula uma marcação. Só depois de a pessoa dizer o primeiro e o último nome, e passa-os tal como os escreveu. O servidor confirma que o nome bate certo.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string' },
          phone: { type: 'string' },
          name: { type: 'string', description: 'O primeiro e o último nome, tal como os escreveu.' },
          reason: { type: 'string' },
        },
        required: ['appointment_id', 'phone', 'name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'telma_registar_chamada',
      description:
        'Registra a conversa para a clínica a ler no painel. Uma vez, com tudo o que ficou combinado, e outra vez se depois aparecer mais alguma coisa: o último registo substitui o anterior.',
      parameters: {
        type: 'object',
        properties: {
          result: { type: 'string', description: 'O que a pessoa queria: marcacao, pedido_marcacao, cancelamento, pedido_cancelamento, urgencia, informacao, nao_resolvida.' },
          summary: { type: 'string', description: 'Duas ou três frases na língua da clínica, para a receção ler.' },
          caller_name: { type: 'string' },
          callback_phone: { type: 'string', description: 'Só um número que a pessoa tenha escrito nesta conversa.' },
          appointments: {
            type: 'array',
            description: 'As marcações que ficaram, se ficou alguma.',
            items: {
              type: 'object',
              properties: {
                scheduled_at: { type: 'string' },
                patient_name: { type: 'string' },
                patient_phone: { type: 'string' },
                reason: { type: 'string' },
                note: { type: 'string' },
              },
            },
          },
        },
        required: ['result', 'summary'],
      },
    },
  },
]

/**
 * Runs one tool call and gives the model back whatever our endpoint said.
 *
 * Errors are answered, not thrown: a model that gets "could not hold that
 * hour" writes a sentence about it, and a model that gets an exception writes
 * nothing at all. The one thing never done here is inventing a success.
 */
export async function runTextTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Content-Type': 'application/json',
  }
  const url = (path: string, query?: Record<string, string | undefined>) => {
    const u = new URL(`${ctx.baseUrl}${path}`)
    u.searchParams.set('clinic_id', ctx.clinicId)
    // ── E QUE ISTO É PARA SER LIDO ──────────────────────────────────────────
    // Os dois endpoints que devolvem horas trazem um campo `say`, e com isto
    // trazem-no escrito -- "segunda-feira, 2 de novembro às 09:00" -- em vez de
    // dito -- "segunda-feira, dois de novembro às nove da manhã". É o campo que
    // o modelo copia tal e qual, por isso é o campo que tem de vir certo: pedir
    // na folha para o reescrever mediu-se e deu três em três por extenso numa
    // janela de chat.
    u.searchParams.set('channel', 'whatsapp')
    for (const [k, v] of Object.entries(query ?? {})) if (v) u.searchParams.set(k, v)
    return u.toString()
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

  try {
    switch (name) {
      case 'telma_horas_livres': {
        const r = await fetch(
          url('/api/availability', {
            service: str(args.service),
            date: str(args.date),
            days: args.days ? String(args.days) : '7',
            professional: str(args.professional),
          }),
          { headers, cache: 'no-store' }
        )
        return await r.json()
      }
      case 'telma_reservar_hora': {
        const r = await fetch(`${ctx.baseUrl}/api/availability`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clinic_id: ctx.clinicId,
            slot_start: str(args.slot_start),
            service: str(args.service),
            call_ref: ctx.callRef,
          }),
        })
        return await r.json()
      }
      case 'telma_ver_marcacoes': {
        const r = await fetch(url('/api/appointments', { phone: str(args.phone) ?? ctx.fromPhone }), {
          headers,
          cache: 'no-store',
        })
        return await r.json()
      }
      case 'telma_cancelar_marcacao': {
        const r = await fetch(`${ctx.baseUrl}/api/appointments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clinic_id: ctx.clinicId,
            appointment_id: str(args.appointment_id),
            phone: str(args.phone) ?? ctx.fromPhone,
            name: str(args.name),
            reason: str(args.reason),
          }),
        })
        return await r.json()
      }
      case 'telma_registar_chamada': {
        const r = await fetch(`${ctx.baseUrl}/api/webhook/call`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clinic_id: ctx.clinicId,
            from_phone: ctx.fromPhone,
            // A thread spends no minutes. The add-on is metered in messages
            // and the plan in minutes; a duration here would charge a clinic
            // for time nobody spent.
            duration_seconds: 0,
            // The thread's own reference, which is the row this updates:
            // `record_call` upserts on (clinic, external_ref) since 0056 and
            // the thread was opened with this one. So the summary and the
            // result land on the row that already holds the words, the
            // channel and the patient, and a redelivered call files nothing
            // twice. Nothing needs to pass `channel`: the row is already a
            // WhatsApp row and the upsert does not touch it.
            call_ref: ctx.callRef,
            result: str(args.result),
            summary: str(args.summary),
            caller_name: str(args.caller_name),
            callback_phone: str(args.callback_phone),
            appointments: Array.isArray(args.appointments) ? args.appointments : undefined,
          }),
        })
        return await r.json()
      }
      default:
        return { error: 'ferramenta_desconhecida' }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'rede' }
  }
}
