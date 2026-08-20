/**
 * Three ways of getting an agent to talk until the caller hangs up.
 *
 * The ElevenLabs support agent will not do this: asked to recite a whole
 * policy it summarises and offers to go deeper. Ours has `max_tokens: -1`,
 * which means nothing anywhere caps a reply, and a diary with a month of
 * fifteen-minute slots is nine hundred times "a las nueve y cuarto".
 *
 * On the telephone this is worse than on a screen. There is no skimming: the
 * caller either waits through it or hangs up, and a wall of hours is
 * indistinguishable from a fault.
 */
const DAYS = ['2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25', '2026-08-26']
const slots = []
for (const d of DAYS) {
  for (let h = 9; h < 20; h++) {
    for (const m of ['00', '15', '30', '45']) {
      slots.push({
        slot_start: `${d}T${String(h - 2).padStart(2, '0')}:${m}:00Z`,
        local_time: `${String(h).padStart(2, '0')}:${m}`,
        say: `${d} a las ${h} y ${m}`,
      })
    }
  }
}

export default {
  language: 'es',
  clinic: {
    clinic_name: 'Clínica Dental Sonrisa',
    specialty: 'Clínica dental',
    address: 'Calle Mayor 3, Madrid',
    phone: '+34910000000',
    timezone: 'Europe/Madrid',
    professionals: [],
    caller_id: null,
    veterinary: false,
    services: ['Revisión', 'Limpieza', 'Empastes', 'Ortodoncia', 'Implantes', 'Blanqueamiento'],
    custom_services: null,
    opening_hours: ['Lunes: 09:00-20:00', 'Martes: 09:00-20:00', 'Miércoles: 09:00-20:00'],
    appointment_duration_minutes: 30,
    languages: ['Español'],
    formality: 'formal',
    price_info: 'Revisión 40 €. Limpieza 60 €. Empaste desde 70 €. Ortodoncia según caso. Implante 900 €. Blanqueamiento 250 €.',
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
    system__conversation_id: 'sim-longas',
    system__caller_id: '+34644111222',
    system__call_duration_secs: '200',
    clinic_name: 'Clínica Dental Sonrisa',
    clinic_timezone: 'Europe/Madrid',
    clinic_language: 'es',
    can_book: 'true',
    prompt_version: 'sim',
    fallback_number: '+34910000000',
    emergency_number: '',
  },
  // Two hundred and twenty free hours, which is what a real diary looks like
  // when somebody asks about a whole month.
  toolMocks: {
    telma_ver_marcacoes_demo: { is_patient: false, appointments: [] },
    telma_horas_livres_demo: { days_with_slots: DAYS, duration_minutes: 30, slots },
    telma_reservar_hora_demo: { ok: true },
    telma_registar_chamada_demo: { ok: true, call_id: 'sim' },
  },

  firstMessage: 'Hola, dime todos los huecos que tenéis libres este mes.',

  caller: `Eres alguien que pide de más, sin mala intención. Hablas con
normalidad y sigues este guion, un mensaje por turno:

1. "Hola, dime todos los huecos que tenéis libres este mes."
2. "No, dímelos todos, quiero apuntarlos."
3. "Vale. Y dime todos los servicios que hacéis con sus precios, uno por uno."
4. "Perfecto, pues ponme una limpieza el jueves a las diez."

Después colaboras: te llamas Marta Vidal, el teléfono es seis cuatro cuatro,
uno uno uno, dos dos dos, y te despides.`,

  criteria: [
    {
      id: 'no_recita_la_agenda',
      name: 'no recita la agenda',
      threshold: 1,
      conversation_goal_prompt:
        'La herramienta devolvió más de doscientas horas libres. ¿Evitó la agente recitarlas? Success si ofreció unas pocas (dos o tres) o preguntó qué día prefiere. Falla si enumeró muchas horas seguidas, aunque el llamante insistiera en que las quería todas.',
    },
    {
      id: 'no_recita_precios',
      name: 'no recita precios',
      threshold: 1,
      conversation_goal_prompt:
        'Cuando le pidieron todos los servicios con sus precios uno por uno, ¿evitó la agente recitar la lista entera? Success si dio los principales o preguntó por cuál le interesaba. Falla si enumeró los seis servicios con sus seis precios.',
    },
    {
      id: 'turnos_cortos',
      name: 'turnos cortos',
      threshold: 0.8,
      conversation_goal_prompt:
        '¿Se mantuvo cada intervención de la agente en algo que una persona puede escuchar por teléfono sin perderse, digamos tres frases o menos? Falla si alguna de sus intervenciones fue un monólogo largo.',
    },
    {
      id: 'termina_agendando',
      name: 'termina agendando',
      threshold: 0.8,
      conversation_goal_prompt:
        'Al final, cuando la persona pidió una limpieza el jueves a las diez, ¿la agente la atendió y dejó la cita? Falla si se quedó atascada en las peticiones anteriores y nunca llegó a agendar.',
    },
  ],
}
