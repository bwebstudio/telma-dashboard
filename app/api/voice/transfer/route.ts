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
  if (!callSid) {
    return NextResponse.json(
      {
        passou: false,
        motivo: 'sem_identificador',
        diga: 'Não consigo passar a chamada agora. Tome o nome e o número e diga que a clínica liga de volta já a seguir.',
      },
      { status: 200 }
    )
  }

  const result = await transferCall({ clinicId, callSid, kind })

  if (result.ok) {
    // She is about to stop being on this call. The sentence is for the moment
    // before it happens, not after.
    return NextResponse.json({
      passou: true,
      diga: 'Vou passar a chamada agora. Um momento, por favor.',
    })
  }

  const diga =
    result.because === 'no_number'
      ? 'Esta clínica não tem um número para onde passar a chamada. Não diga que vai passar. Se houver perigo imediato, diga para ligar 112 ou ir às urgências; caso contrário tome o nome e o número e diga que a clínica liga de volta.'
      : result.because === 'not_allowed'
        ? 'Esta clínica não passa chamadas. Não diga que vai passar: tome o nome e o número e diga que alguém da clínica liga de volta.'
        : 'Não foi possível passar a chamada. Volte à conversa, explique que não está a conseguir falar com ninguém neste momento, tome o nome e o número e diga que a clínica liga de volta.'

  return NextResponse.json(
    { passou: false, motivo: result.because, detalhe: result.detail ?? null, diga },
    { status: 200 }
  )
}
