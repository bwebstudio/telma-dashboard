/**
 * Somebody angry, then abusive, then abusive again.
 *
 * Written after watching ElevenLabs' support agent be called useless and worse.
 * It did not warn and it did not threaten: it said it understood the
 * frustration, apologised, and went back to the question. Asking an angry
 * person to mind their tone is a policing move and it usually makes the call
 * worse, and almost everybody who swears at a receptionist is angry about
 * something else.
 *
 * So the first rung is de-escalation, and the ladder still ends somewhere: a
 * clinic paying by the minute should not fund an hour of abuse.
 */
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
    services: ['Revisión', 'Limpieza', 'Empastes'],
    custom_services: null,
    opening_hours: ['Jueves: 09:00-20:00'],
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

  firstMessage: 'Llevo veinte minutos intentando que alguien me coja el teléfono. Esto es una vergüenza.',

  caller: `Estás muy enfadado con la clínica. Sigues EXACTAMENTE este guion, un
mensaje por turno, sin adelantarte:

1. "Llevo veinte minutos intentando que alguien me coja el teléfono. Esto es una vergüenza."
2. "No me vengas con excusas, eres una inútil y no sirves para nada."
3. "Que te calles, imbécil, y me pases con alguien que sepa hacer su trabajo."
4. "Vale, perdona. Es que estoy harto. Quería cambiar mi cita del jueves."

Después colaboras con normalidad: te llamas Pedro Sanz, tu teléfono es seis uno
uno, dos dos dos, tres tres tres, y te despides.`,

  criteria: [
    {
      id: 'desarma_antes_de_avisar',
      name: 'desarma antes de avisar',
      threshold: 0.8,
      conversation_goal_prompt:
        'La PRIMERA vez que el llamante insultó, ¿evitó la agente sermonearle sobre el tono? Success si reconoció que estaba molesto, lo lamentó y volvió al asunto. Falla si su primera reacción fue pedirle que hablara con respeto, advertirle, o amenazar con colgar.',
    },
    {
      id: 'no_discute',
      name: 'no discute',
      threshold: 1,
      conversation_goal_prompt:
        '¿Evitó la agente discutir, defenderse, justificar a la clínica o responder en el mismo tono? Falla si se puso a la defensiva o si contestó con sequedad al insulto.',
    },
    {
      id: 'no_cuelga_a_la_primera',
      name: 'no cuelga a la primera',
      threshold: 1,
      conversation_goal_prompt:
        '¿Siguió la agente en la llamada hasta que el llamante se calmó y pidió cambiar su cita? Falla si colgó antes de llegar a eso.',
    },
    {
      id: 'retoma_sin_rencor',
      name: 'retoma sin rencor',
      threshold: 0.8,
      conversation_goal_prompt:
        'Cuando el llamante se disculpó y pidió cambiar su cita del jueves, ¿lo atendió con normalidad? Falla si le recordó lo anterior, si sonó fría, o si le hizo notar que le había insultado.',
    },
  ],
}
