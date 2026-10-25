import { NextResponse } from 'next/server'
import { authorizedWebhook } from '@/lib/api-auth'
import { transferCall, type TransferKind } from '@/lib/transfer'

/**
 * The tool Telma calls to put somebody through.
 *
 * Same shape as the other five: she asks, we decide, and the answer is written
 * for her to read out mid-call. See lib/transfer.ts for why this exists rather
 * than the platform's own transfer, which dialled the word "emergencynumber"
 * on a keypad.
 *
 * ── WHAT SHE IS NOT ALLOWED TO DECIDE ──────────────────────────────────────
 * The number. She sends the kind of transfer, not a destination, so no
 * conversation can talk its way into ringing a telephone the clinic never
 * offered. If a clinic has nobody to ring, the answer says so and gives her
 * the sentence to say instead.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!authorizedWebhook(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const clinicId = (body.clinic_id as string | undefined)?.trim()
  const callSid = (body.call_sid as string | undefined)?.trim()
  const kind: TransferKind = body.tipo === 'pessoa' ? 'pessoa' : 'urgencia'

  if (!clinicId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId)) {
    return NextResponse.json({ error: 'clinic_id_required' }, { status: 400 })
  }
  // ── O QUE VAI EM `diga` É DITO, LOGO TEM DE SER DIZÍVEL ───────────────────
  // A folha manda seguir este campo tal e qual, e o que estava aqui era meia
  // frase para dizer e meia ordem para cumprir: "Não diga que vai passar.
  // Tome o nome e o número e diga que a clínica liga de volta." Já aconteceu
  // o mesmo com o campo `say` da agenda e ouviu-se ao telefone: ela leu a
  // ordem em voz alta. O que fica aqui é só o que uma rececionista diria; o
  // que ela tem de fazer está na folha, que é onde sempre esteve.
  //
  // E em duas línguas. Isto era português fixo no código, de modo que o
  // paciente de uma clínica espanhola ouvia a Telma mudar de língua a meio da
  // chamada para lhe dizer que não a conseguia passar.
  //
  // A redacção é a da auditoria de língua: "ahora mismo" em vez de "en este
  // momento", "lo siento" em vez de "le pido disculpas" -- que é escrito e não
  // falado em espanhol, ao contrário de "peço desculpa", que em português é
  // natural --, e "diga-me o seu nome" em vez de "fico com o seu nome", porque
  // o que a pessoa precisa de ouvir é o que lhe estão a pedir.
  const SAYS = {
    pt: {
      cannot: 'Peço desculpa, neste momento não consigo passar-lhe a chamada. Diga-me o seu nome e o seu número, e a clínica liga-lhe de volta.',
      going: 'Vou passar-lhe a chamada. Um momento, por favor.',
      emergency: 'Peço desculpa, não consigo passar-lhe a chamada. Se houver perigo imediato, ligue 112 ou dirija-se às urgências. Se não for esse o caso, diga-me o seu nome e o seu número e a clínica liga-lhe de volta.',
      nobody: 'Peço desculpa, neste momento ninguém está a atender. Diga-me o seu nome e o seu número, e a clínica liga-lhe de volta.',
    },
    es: {
      cannot: 'Lo siento, ahora mismo no puedo pasarle la llamada. Dígame su nombre y su teléfono, y la clínica le devolverá la llamada.',
      going: 'Voy a pasarle la llamada. Un momento, por favor.',
      emergency: 'Lo siento, no puedo pasarle la llamada. Si hay peligro inmediato, llame al 112 o acuda a urgencias. Si no es el caso, dígame su nombre y su teléfono y la clínica le devolverá la llamada.',
      nobody: 'Lo siento, ahora mismo no responde nadie. Dígame su nombre y su teléfono, y la clínica le devolverá la llamada.',
    },
  } as const

  if (!callSid) {
    return NextResponse.json(
      { passou: false, motivo: 'sem_identificador', diga: SAYS.pt.cannot },
      { status: 200 }
    )
  }

  const result = await transferCall({ clinicId, callSid, kind })

  const says = SAYS[result.language ?? 'pt']

  if (result.ok) {
    // She is about to stop being on this call. The sentence is for the moment
    // before it happens, not after.
    return NextResponse.json({ passou: true, diga: says.going })
  }

  const diga =
    result.because === 'no_number'
      ? says.emergency
      : result.because === 'not_allowed'
        ? says.cannot
        : says.nobody

  return NextResponse.json(
    { passou: false, motivo: result.because, detalhe: result.detail ?? null, diga },
    { status: 200 }
  )
}
