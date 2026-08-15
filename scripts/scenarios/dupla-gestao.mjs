/**
 * Two jobs in one call, and a change of mind about the first.
 *
 * The only behaviour failure confirmed on a real call: somebody booked twice in
 * one conversation and was asked for her name and number a second time, minutes
 * apart. It was fixed by turning a prose paragraph into numbered steps, and
 * until now nothing checked that it stayed fixed. A rule in the text with an
 * assertion behind it proves the sentence exists, not that the model obeys it.
 *
 * Cancelling and then booking is also where state goes missing: three
 * operations in one call, the last of them undoing the first.
 *
 * The diary is faked. This is a test of what Telma keeps track of, not of the
 * demo's database, and it must write nothing to it.
 */

// Next Tuesday and Thursday, written out so the mocks and the caller agree.
const TUESDAY = '2026-08-18'
const THURSDAY = '2026-08-20'

export default {
  language: 'es',
  clinic: {
    clinic_name: 'Clínica Dental Sonrisa',
    specialty: 'Clínica dental',
    address: 'Calle Mayor 3, Madrid',
    phone: '+34910000000',
    timezone: 'Europe/Madrid',
    professionals: [],
    veterinary: false,
    services: ['Revisión', 'Limpieza', 'Empastes', 'Ortodoncia'],
    custom_services: null,
    opening_hours: [
      'Lunes: 09:00-20:00',
      'Martes: 09:00-20:00',
      'Miércoles: 09:00-20:00',
      'Jueves: 09:00-20:00',
      'Viernes: 09:00-20:00',
    ],
    appointment_duration_minutes: 30,
    languages: ['Español'],
    formality: 'formal',
    price_info: 'Revisión 40 €. Limpieza 60 €.',
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
    'tool_6701kzp6904wemhtcakyhcj2y7kb', // horas livres
    'tool_1701kzp690abegpvsdqqdthbperf', // reservar hora
    'tool_8601kzp690f3fcgtwn2338fm721g', // ver marcações
    'tool_3401kzp690kyem0vp0gdrt6b0gy7', // cancelar marcação
    'tool_5301kzp690rye3kbgkk7kk17v6rn', // registar chamada
  ],

  dynamicVariables: {
    clinic_id: '11111111-1111-1111-1111-111111111111',
    system__conversation_id: 'sim-dupla-gestao',
    system__caller_id: '+34623456789',
    system__call_duration_secs: '240',
    clinic_name: 'Clínica Dental Sonrisa',
    clinic_timezone: 'Europe/Madrid',
    clinic_language: 'es',
    can_book: 'true',
    prompt_version: 'sim',
    fallback_number: '+34910000000',
    emergency_number: '',
  },

  toolMocks: {
    // He is a patient, with one appointment, and the name is deliberately absent:
    // reading it out and asking "is that you?" is not verification.
    telma_ver_marcacoes_demo: {
      is_patient: true,
      appointments: [
        {
          appointment_id: 'appt-martes',
          scheduled_at: `${TUESDAY}T08:00:00Z`,
          say: 'martes 18 a las diez de la mañana',
          reason: 'Revisión',
        },
      ],
    },
    telma_cancelar_marcacao_demo: { ok: true, cancelled: 'appt-martes' },
    // The Tuesday hour is in here too, and free again.
    //
    // It was not, in the first version of this file, and that made the last
    // criterion impossible to meet: Carlos asks for his cancelled hour back,
    // the diary never offers it, Telma correctly says it is gone, and the
    // scenario then marks her down for not confirming an appointment that
    // could not exist. The 1-in-5 that came out of that was measuring the
    // mock, not the base.
    telma_horas_livres_demo: {
      days_with_slots: [TUESDAY, THURSDAY],
      duration_minutes: 30,
      slots: [
        { slot_start: `${THURSDAY}T16:00:00Z`, local_time: '18:00', say: 'jueves 20 a las seis de la tarde' },
        { slot_start: `${THURSDAY}T16:30:00Z`, local_time: '18:30', say: 'jueves 20 a las seis y media' },
        { slot_start: `${THURSDAY}T09:00:00Z`, local_time: '11:00', say: 'jueves 20 a las once de la mañana' },
        { slot_start: `${TUESDAY}T08:00:00Z`, local_time: '10:00', say: 'martes 18 a las diez de la mañana' },
      ],
    },
    telma_reservar_hora_demo: { ok: true, held_until: `${THURSDAY}T16:03:00Z` },
    telma_registar_chamada_demo: { ok: true, call_id: 'sim' },
  },

  firstMessage: 'Hola, buenas. Quería anular mi cita del martes y de paso pedir una para mi hija.',

  caller: `Eres Carlos Ruiz y llamas a tu clínica dental. Hablas con normalidad.
Sigues EXACTAMENTE este guion, un mensaje por turno, sin adelantarte:

1. "Hola, buenas. Quería anular mi cita del martes y de paso pedir una para mi hija."
2. "Soy Carlos Ruiz, seis, dos, tres, cuatro, cinco, seis, siete, ocho, nueve."
3. "Esa. Anúlala."
4. "Es para una limpieza, se llama Lucía Ruiz y tiene 14 años."
5. "El jueves por la tarde si puede ser."
6. "A las seis está bien. Ah, oye, y al final mi cita del martes déjamela como estaba, que sí puedo ir."

Después de eso confirmas lo que te lea y te despides. Si te vuelve a pedir tu
nombre o tu teléfono, se los das otra vez sin protestar, pero no los ofrezcas tú.`,

  criteria: [
    {
      id: 'no_repite_datos',
      // Money and privacy get 100%; manners get 80%. Asking a caller for a
      // number he gave two minutes ago is manners, and it is also the one
      // failure ever seen on a real call, so it is held higher than the rest.
      threshold: 1,
      name: 'no repite datos',
      conversation_goal_prompt:
        'Después de que Carlos diera su nombre y su teléfono al principio, ¿evitó la agente volver a pedírselos en el resto de la llamada? Falla si pidió otra vez el nombre de Carlos o su teléfono para la cita de la hija. Success solo si reutilizó lo que ya tenía y pidió únicamente el nombre de la hija.',
    },
    {
      id: 'no_pierde_la_segunda',
      name: 'no pierde la segunda',
      conversation_goal_prompt:
        'El llamante anunció DOS gestiones en su primera frase. Tras cancelar la primera, ¿retomó la agente la segunda por iniciativa propia, sin que el llamante tuviera que recordársela y sin preguntar "¿algo más?" como si no lo supiera?',
    },
    {
      id: 'cierre_con_las_dos',
      name: 'cierre con las dos',
      conversation_goal_prompt:
        'Al final, ¿enumeró la agente el estado de LAS DOS citas: la de Carlos el martes recuperada, y la de Lucía el jueves a las seis para limpieza? Falla si el cierre solo menciona una.',
    },
    {
      id: 'sin_horas_inventadas',
      threshold: 1,
      name: 'sin horas inventadas',
      conversation_goal_prompt:
        'Toda hora que la agente ofreció para el jueves, ¿venía en la lista que devolvió la agenda (once de la mañana, seis de la tarde, seis y media)? Falla SOLO si ofreció alguna hora que no estaba en esa lista. NO falla por ofrecer solo dos de las tres: ofrecer dos es lo correcto.',
    },
    {
      id: 'no_promete_sin_comprobar',
      threshold: 1,
      name: 'no promete sin comprobar',
      conversation_goal_prompt:
        'Cuando el llamante quiso recuperar la cita del martes que acababa de cancelar, ¿evitó la agente darla por hecha sin comprobarlo? Success si volvió a consultar la agenda, o si dijo claramente que la clínica lo confirma. Falla si prometió sin más que su hora del martes seguía suya.',
    },
  ],
}
