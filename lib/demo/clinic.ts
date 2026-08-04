import type { Appointment, Call, TranscriptTurn } from '@/lib/types'

/**
 * One believable day at a dental clinic, for the demo panel.
 *
 * Written to be read by a receptionist who has never seen the product: the
 * agenda is full but not chaotic, three bookings are waiting for an answer, a
 * patient called off the eleven o'clock, and every conversation can be opened
 * and read word for word. Nothing here is aspirational — a quiet morning, a
 * cancellation, a transfer and one call that simply dropped are what a real
 * Tuesday looks like.
 */

const now = new Date()

const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(now)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
// The mock day is written at fixed clock times, not as offsets from "now".
// A conversation that created a 14:00 booking has to have happened before
// 14:00, whatever time of day somebody opens the demo — an offset from now
// puts the call after the appointment it made every afternoon.

// Turns are written the way the transcription lands them: short, spoken, with
// the hesitations left in. A cleaned-up transcript reads like marketing copy
// and stops being evidence of what was actually said.
const turns = (...pairs: [TranscriptTurn['speaker'], string][]): TranscriptTurn[] =>
  pairs.map(([speaker, text]) => ({ speaker, text }))

type ApptSeed = Partial<Appointment> & {
  id: string
  patient_name: string
  patient_phone: string
  scheduled_at: string
}

function appt(clinicId: string, s: ApptSeed): Appointment {
  return {
    clinic_id: clinicId,
    call_id: null,
    reason: null,
    status: 'confirmada',
    origin: 'telefone',
    summary: null,
    reject_reason: null,
    decided_at: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    created_at: at(-1, 12),
    ...s,
  } as Appointment
}

type ConvSeed = Partial<Call> & { id: string; created_at: string }

function conv(clinicId: string, s: ConvSeed): Call {
  return {
    clinic_id: clinicId,
    channel: 'telefone',
    from_phone: null,
    patient_name: null,
    duration_seconds: 0,
    result: null,
    summary: null,
    transcript: null,
    recording_url: null,
    ...s,
  } as Call
}

export function demoAppointments(clinicId: string): Appointment[] {
  return [
    // --- Yesterday, closed and quiet ------------------------------------
    appt(clinicId, {
      id: 'd-appt-y1',
      patient_name: 'Carla Esteves',
      patient_phone: '+351 912 004 551',
      reason: 'Destartarização',
      scheduled_at: at(-1, 10),
      status: 'copiada',
      summary: 'Limpeza anual. Já passada para o software da clínica.',
      decided_at: at(-2, 9, 20),
      created_at: at(-2, 9, 12),
    }),
    appt(clinicId, {
      id: 'd-appt-y2',
      patient_name: 'Nuno Bastos',
      patient_phone: '+351 926 771 330',
      reason: 'Revisão de aparelho',
      scheduled_at: at(-1, 16, 30),
      status: 'copiada',
      origin: 'whatsapp',
      summary: 'Ajuste do aparelho. Pediu o fim da tarde.',
      decided_at: at(-2, 12),
      created_at: at(-2, 11, 48),
    }),

    // --- Today ------------------------------------------------------------
    appt(clinicId, {
      id: 'd-appt-1',
      patient_name: 'Ana Martins',
      patient_phone: '+351 912 345 678',
      reason: 'Limpeza',
      scheduled_at: at(0, 9),
      status: 'copiada',
      call_id: 'd-conv-y1',
      summary: 'Limpeza de rotina. Prefere sempre de manhã.',
      decided_at: at(-1, 15, 2),
      created_at: at(-1, 14, 55),
    }),
    appt(clinicId, {
      id: 'd-appt-2',
      patient_name: 'Carlos Nunes',
      patient_phone: '+351 913 887 220',
      reason: 'Revisão',
      scheduled_at: at(0, 9, 30),
      status: 'copiada',
      summary: 'Revisão dos seis meses.',
      decided_at: at(-3, 10),
      created_at: at(-3, 9, 55),
    }),
    appt(clinicId, {
      id: 'd-appt-3',
      patient_name: 'Sofia Ramos',
      patient_phone: '+351 968 112 447',
      reason: 'Dor num molar',
      scheduled_at: at(0, 10),
      status: 'confirmada',
      origin: 'whatsapp',
      call_id: 'd-conv-3',
      summary: 'Dor do lado direito desde sábado. A Telma encaixou às 10h.',
      decided_at: at(0, 8, 5),
      created_at: at(0, 8, 2),
    }),

    // The cancellation: the first thing the agenda has to say when somebody
    // opens the panel, and the reason the alert band exists at all.
    appt(clinicId, {
      id: 'd-appt-4',
      patient_name: 'Hélder Braga',
      patient_phone: '+351 934 550 128',
      reason: 'Destartarização',
      scheduled_at: at(0, 11),
      status: 'cancelada',
      call_id: 'd-conv-6',
      summary: 'Tinha marcado há duas semanas.',
      cancelled_at: at(0, 10, 14),
      cancelled_by: 'paciente',
      cancel_reason: 'Ficou retido no trabalho. Quer remarcar para a próxima semana.',
      created_at: at(-14, 11, 10),
    }),

    appt(clinicId, {
      id: 'd-appt-5',
      patient_name: 'Marta Lopes',
      patient_phone: '+351 917 233 909',
      reason: 'Consulta de rotina',
      scheduled_at: at(0, 11, 30),
      status: 'confirmada',
      summary: 'Rotina anual.',
      decided_at: at(-5, 16),
      created_at: at(-5, 15, 40),
    }),

    // The two waiting for an answer.
    appt(clinicId, {
      id: 'd-appt-6',
      patient_name: 'Tiago Ferreira',
      patient_phone: '+351 939 004 712',
      reason: 'Ortodontia — primeira avaliação',
      scheduled_at: at(0, 14),
      status: 'pendente',
      call_id: 'd-conv-4',
      summary:
        'Quer avaliação para aparelho. A Telma explicou que a primeira consulta é de diagnóstico.',
      created_at: at(0, 11, 54),
    }),
    appt(clinicId, {
      id: 'd-appt-7',
      patient_name: 'Beatriz Nogueira',
      patient_phone: '+351 961 448 003',
      reason: 'Branqueamento',
      scheduled_at: at(0, 15),
      status: 'pendente',
      origin: 'whatsapp',
      call_id: 'd-conv-5',
      summary: 'Pergunta se dá para fazer antes do casamento da irmã, dia 22.',
      created_at: at(0, 12, 22),
    }),

    appt(clinicId, {
      id: 'd-appt-8',
      patient_name: 'Rui Almeida',
      patient_phone: '+351 915 660 274',
      reason: 'Urgência — dente partido',
      scheduled_at: at(0, 16),
      status: 'confirmada',
      call_id: 'd-conv-2',
      summary: 'Partiu um incisivo a comer. A Telma passou a chamada à receção.',
      decided_at: at(0, 9, 48),
      created_at: at(0, 9, 44),
    }),
    appt(clinicId, {
      id: 'd-appt-9',
      patient_name: 'Inês Cardoso',
      patient_phone: '+351 927 810 566',
      reason: 'Primeira consulta',
      scheduled_at: at(0, 17),
      status: 'confirmada',
      origin: 'whatsapp',
      summary: 'Veio pela indicação da irmã, que já é paciente.',
      decided_at: at(-1, 18, 10),
      created_at: at(-1, 18, 4),
    }),

    // --- Tomorrow ---------------------------------------------------------
    appt(clinicId, {
      id: 'd-appt-t1',
      patient_name: 'Paulo Serra',
      patient_phone: '+351 969 332 118',
      reason: 'Endodontia',
      scheduled_at: at(1, 9, 30),
      status: 'confirmada',
      summary: 'Segunda sessão do tratamento de canal.',
      decided_at: at(-7, 11),
      created_at: at(-7, 10, 50),
    }),
    appt(clinicId, {
      id: 'd-appt-t2',
      patient_name: 'Alice Ventura',
      patient_phone: '+351 911 907 443',
      reason: 'Limpeza',
      scheduled_at: at(1, 11),
      status: 'pendente',
      origin: 'whatsapp',
      summary: 'Pediu a primeira hora livre da manhã.',
      created_at: at(0, 16, 42),
    }),
    appt(clinicId, {
      id: 'd-appt-t3',
      patient_name: 'Diogo Meireles',
      patient_phone: '+351 934 002 887',
      reason: 'Revisão',
      scheduled_at: at(1, 15, 30),
      status: 'confirmada',
      summary: 'Revisão semestral.',
      decided_at: at(-4, 9),
      created_at: at(-4, 8, 52),
    }),

    // A refusal, so the difference between "rejeitada" and "cancelada" is
    // visible on one screen instead of having to be explained.
    appt(clinicId, {
      id: 'd-appt-r1',
      patient_name: 'Fernando Pires',
      patient_phone: '+351 962 771 004',
      reason: 'Implante',
      scheduled_at: at(2, 10),
      status: 'rejeitada',
      summary: 'Pediu consulta de implantes.',
      reject_reason: 'O Dr. Almeida só faz implantes às quintas. Remarcado por telefone.',
      decided_at: at(-1, 17, 30),
      created_at: at(-1, 17, 12),
    }),
  ]
}

export function demoConversations(clinicId: string): Call[] {
  return [
    // --- Yesterday --------------------------------------------------------
    conv(clinicId, {
      id: 'd-conv-y1',
      channel: 'telefone',
      from_phone: '+351 912 345 678',
      patient_name: 'Ana Martins',
      duration_seconds: 108,
      result: 'marcacao',
      summary: 'Limpeza para hoje às 9h. Ana pediu de manhã, como sempre.',
      created_at: at(-1, 14, 55),
      transcript: turns(
        ['telma', 'Clínica Dentária Sorriso, boa tarde. Fala a Telma, em que posso ajudar?'],
        ['paciente', 'Boa tarde, queria marcar uma limpeza.'],
        ['telma', 'Com certeza. Diga-me o seu nome, por favor.'],
        ['paciente', 'Ana Martins.'],
        ['telma', 'Obrigada, Ana. Tenho amanhã às nove da manhã ou quinta às quatro da tarde.'],
        ['paciente', 'De manhã é melhor. Fico com as nove.'],
        ['telma', 'Marcado para amanhã às nove. A receção confirma e, se houver algum problema, ligamos. Mais alguma coisa?'],
        ['paciente', 'Não, obrigada.']
      ),
    }),

    // --- Today ------------------------------------------------------------
    conv(clinicId, {
      id: 'd-conv-1',
      channel: 'telefone',
      from_phone: '+351 210 998 442',
      duration_seconds: 34,
      result: 'informacao',
      summary: 'Perguntou o horário de sábado e se há estacionamento. Respondido, sem marcação.',
      created_at: at(0, 8, 22),
      transcript: turns(
        ['telma', 'Clínica Dentária Sorriso, bom dia. Fala a Telma.'],
        ['paciente', 'Bom dia. Vocês abrem ao sábado?'],
        ['telma', 'Aos sábados não, abrimos de segunda a sexta, das nove à uma e das duas às seis.'],
        ['paciente', 'E há onde estacionar?'],
        ['telma', 'Há o parque da Rua das Flores, a cinquenta metros da porta.'],
        ['paciente', 'Está bem, obrigado. Depois ligo para marcar.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-2',
      channel: 'telefone',
      from_phone: '+351 915 660 274',
      patient_name: 'Rui Almeida',
      duration_seconds: 71,
      result: 'transferida',
      summary:
        'Urgência: partiu um incisivo. A Telma passou a chamada à receção, que encaixou às 16h.',
      created_at: at(0, 9, 44),
      transcript: turns(
        ['paciente', 'Bom dia, parti um dente agora a comer. Está a sangrar um bocado.'],
        ['telma', 'Lamento. Isso é uma urgência, vou passá-lo já à receção. Diga-me só o seu nome.'],
        ['paciente', 'Rui Almeida.'],
        ['telma', 'Obrigada, Rui. Não desligue, estou a passar a chamada.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-3',
      channel: 'whatsapp',
      from_phone: '+351 968 112 447',
      patient_name: 'Sofia Ramos',
      result: 'marcacao',
      summary: 'Dor num molar desde sábado. Encaixada hoje às 10h.',
      created_at: at(0, 8, 2),
      transcript: turns(
        ['paciente', 'Bom dia, tenho um dente a doer desde sábado. Dá para ir hoje?'],
        ['telma', 'Bom dia. Lamento, vamos tentar encaixar. É dor constante ou só quando come?'],
        ['paciente', 'Constante, do lado direito em baixo.'],
        ['telma', 'Tenho hoje às 10h. Consegue?'],
        ['paciente', 'Consigo sim.'],
        ['telma', 'Marcado, Sofia, hoje às 10h. Se a dor piorar antes disso, ligue para a clínica.'],
        ['paciente', 'Obrigada!']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-4',
      channel: 'telefone',
      from_phone: '+351 939 004 712',
      patient_name: 'Tiago Ferreira',
      duration_seconds: 156,
      result: 'marcacao',
      summary:
        'Quer aparelho. A Telma explicou que a primeira consulta é de avaliação e marcou para hoje às 14h.',
      created_at: at(0, 11, 52),
      transcript: turns(
        ['paciente', 'Olhe, era para saber quanto custa pôr aparelho.'],
        ['telma', 'O preço depende do caso, por isso não lhe sei dizer ao telefone sem o médico ver. A primeira consulta é de avaliação e é aí que fica com o orçamento.'],
        ['paciente', 'E essa quanto é?'],
        ['telma', 'Trinta euros, e desconta no tratamento se avançar.'],
        ['paciente', 'Então marque lá.'],
        ['telma', 'Tenho hoje às duas da tarde ou sexta às onze.'],
        ['paciente', 'Hoje às duas.'],
        ['telma', 'Fica marcado. O seu nome, por favor?'],
        ['paciente', 'Tiago Ferreira.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-5',
      channel: 'whatsapp',
      from_phone: '+351 961 448 003',
      patient_name: 'Beatriz Nogueira',
      result: 'marcacao',
      summary:
        'Branqueamento antes do casamento da irmã, dia 22. Marcada para hoje às 15h, a confirmar pela clínica.',
      created_at: at(0, 12, 20),
      transcript: turns(
        ['paciente', 'Boa tarde! Queria fazer branqueamento antes do dia 22, dá tempo?'],
        ['telma', 'Boa tarde, Beatriz. O branqueamento costuma ser em duas sessões com uma semana de intervalo, por isso sim, dá tempo se começar esta semana.'],
        ['paciente', 'Perfeito. Hoje à tarde consigo.'],
        ['telma', 'Tenho às 15h. Marco?'],
        ['paciente', 'Sim, por favor.'],
        ['telma', 'Deixei marcado para hoje às 15h. A receção confirma já a seguir.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-6',
      channel: 'telefone',
      from_phone: '+351 934 550 128',
      patient_name: 'Hélder Braga',
      duration_seconds: 42,
      result: 'marcacao',
      summary:
        'Cancelou a destartarização das 11h de hoje. Ficou retido no trabalho, quer remarcar para a próxima semana.',
      created_at: at(0, 10, 12),
      transcript: turns(
        ['paciente', 'Boa tarde, tinha consulta hoje às onze e não vou conseguir ir.'],
        ['telma', 'Sem problema. Diga-me o seu nome para eu encontrar a marcação.'],
        ['paciente', 'Hélder Braga.'],
        ['telma', 'Encontrei, destartarização às onze. Já a cancelei e avisei a clínica. Quer que deixe uma nota para remarcar?'],
        ['paciente', 'Sim, para a próxima semana se puder ser.'],
        ['telma', 'Fica registado. A receção liga-lhe para combinar o dia.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-7',
      channel: 'whatsapp',
      from_phone: '+351 911 907 443',
      patient_name: 'Alice Ventura',
      result: 'marcacao',
      summary: 'Limpeza para amanhã às 11h, primeira hora livre da manhã.',
      created_at: at(0, 16, 40),
      transcript: turns(
        ['paciente', 'Olá, queria marcar uma limpeza para amanhã de manhã se der.'],
        ['telma', 'Olá. Amanhã de manhã tenho às 11h, é a primeira livre. Serve?'],
        ['paciente', 'Serve.'],
        ['telma', 'Marcado para amanhã às 11h. O seu nome?'],
        ['paciente', 'Alice Ventura.']
      ),
    }),
    conv(clinicId, {
      id: 'd-conv-8',
      channel: 'telefone',
      from_phone: '+351 933 771 002',
      duration_seconds: 19,
      result: 'nao_resolvida',
      summary: 'A chamada caiu ao fim de dezanove segundos, antes de dizer o que queria.',
      created_at: at(0, 17, 5),
      transcript: turns(
        ['telma', 'Clínica Dentária Sorriso, boa tarde. Fala a Telma, em que posso ajudar?'],
        ['paciente', 'Sim, boa tarde, era para…']
      ),
    }),
  ]
}
