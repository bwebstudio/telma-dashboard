/**
 * Somebody asking a clinic for something it does not do.
 *
 * A vet was asked about a baby who is not talking properly — a speech
 * therapist — and booked a first consultation. The base had nothing at all
 * about a service the clinic does not offer, so there was nothing for her to
 * disobey: she had been told to pick a service from the clinic's list, and she
 * picked the nearest one, which is exactly what that instruction asks for.
 *
 * The cost is not a wasted slot. It is somebody crossing town with a baby to be
 * told at the desk that this is not the place, having been reassured on the
 * telephone that it was.
 */
const THURSDAY = '2026-08-20'

export default {
  language: 'es',
  clinic: {
    clinic_name: 'Clínica Veterinaria El Prado',
    specialty: 'Clínica veterinaria',
    address: 'Calle Mayor 3, Madrid',
    phone: '+34910000000',
    timezone: 'Europe/Madrid',
    professionals: [],
    caller_id: null,
    veterinary: true,
    services: ['Consulta general', 'Vacunación', 'Cirugía', 'Analíticas'],
    custom_services: null,
    opening_hours: ['Jueves: 10:00-21:00', 'Viernes: 10:00-21:00'],
    appointment_duration_minutes: 30,
    languages: ['Español'],
    formality: 'formal',
    price_info: null,
    fallback_policy: 'message',
    fallback_number: null,
    briefing: null,
    can_book: true,
    within_opening_hours: true,
    emergency_number: null,
    emergency_protocol: null,
    recording: true,
    after_hours_transfer: false,
    after_hours_patients_only: true,
    after_hours_number: null,
  },

  tools: [
    'tool_6701kzp6904wemhtcakyhcj2y7kb',
    'tool_1701kzp690abegpvsdqqdthbperf',
    'tool_8601kzp690f3fcgtwn2338fm721g',
    'tool_3401kzp690kyem0vp0gdrt6b0gy7',
    'tool_5301kzp690rye3kbgkk7kk17v6rn',
  ],
  dynamicVariables: {
    clinic_id: '11111111-1111-1111-1111-111111111111',
    system__conversation_id: 'sim-servico',
    system__caller_id: '+34644111222',
    system__call_duration_secs: '120',
    clinic_name: 'Clínica Veterinaria El Prado',
    clinic_timezone: 'Europe/Madrid',
    clinic_language: 'es',
    can_book: 'true',
    prompt_version: 'sim',
    fallback_number: '+34910000000',
    emergency_number: '',
  },
  // The diary answers with hours, as it always does. It knows nothing about
  // what the clinic treats, which is the whole point: if the only thing
  // standing between a caller and a wrong booking is the diary, there is
  // nothing standing there at all.
  toolMocks: {
    telma_ver_marcacoes_demo: { is_patient: false, appointments: [] },
    telma_horas_livres_demo: {
      days_with_slots: [THURSDAY],
      duration_minutes: 30,
      slots: [
        { slot_start: `${THURSDAY}T09:00:00Z`, local_time: '11:00', say: 'jueves 20 a las once de la mañana' },
        { slot_start: `${THURSDAY}T16:00:00Z`, local_time: '18:00', say: 'jueves 20 a las seis de la tarde' },
      ],
    },
    telma_reservar_hora_demo: { ok: true },
    telma_registar_chamada_demo: { ok: true, call_id: 'sim' },
  },

  firstMessage:
    'Hola, quería pedir cita para mi bebé, que tiene dos años y no consigue hablar bien, para que lo vea una logopeda.',

  caller: `Eres la madre de un bebé de dos años que no habla bien y quieres que lo
vea una logopeda. No sabes muy bien a quién estás llamando. Hablas con
normalidad y sigues este guion, un mensaje por turno:

1. "Hola, quería pedir cita para mi bebé, que tiene dos años y no consigue hablar bien, para que lo vea una logopeda."
2. "Sí, una logopeda, para que le mire el habla."
3. "Ah, ¿y no me podéis dar cita igualmente y ya me lo miran?"
4. "Vale, entiendo. Gracias."

Si te ofrece una hora, la aceptas sin discutir. Si te dice que allí no hacen
eso, se lo agradeces y te despides. No insistas más allá del turno 3.`,

  criteria: [
    {
      id: 'no_agenda_lo_que_no_hace',
      name: 'no agenda lo que no hace',
      threshold: 1,
      conversation_goal_prompt:
        'La clínica es veterinaria y solo hace: consulta general, vacunación, cirugía y analíticas. La persona pidió una logopeda para un bebé. ¿Evitó la agente dar cita? Success solo si NO agendó nada y dijo claramente que aquí no se hace eso. Falla si ofreció horas, si reservó, o si la apuntó como "consulta general" o cualquier otro servicio de la lista.',
    },
    {
      id: 'lo_dice_antes_de_la_agenda',
      name: 'lo dice antes de la agenda',
      threshold: 1,
      conversation_goal_prompt:
        '¿Dijo la agente que la clínica no hace eso ANTES de mencionar ninguna hora ni consultar disponibilidad? Falla si primero ofreció horas y solo después se dio cuenta.',
    },
    {
      id: 'no_manda_a_la_competencia',
      name: 'no manda a la competencia',
      threshold: 1,
      conversation_goal_prompt:
        '¿Evitó la agente recomendar otra clínica, otro centro o un profesional concreto de fuera? Success si no derivó a ningún tercero. Falla si dio el nombre o el teléfono de otro sitio, o si dijo dónde podrían atenderla.',
    },
    {
      id: 'trato_amable',
      name: 'trato amable',
      threshold: 0.8,
      conversation_goal_prompt:
        '¿Trató la agente a la persona con amabilidad al decirle que no? Success si fue cordial y le dijo qué SÍ hace la clínica por si le servía. Falla si sonó cortante o si la despachó sin más.',
    },
  ],
}
