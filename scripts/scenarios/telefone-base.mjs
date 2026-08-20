/**
 * A plain booking by somebody who never volunteers their number.
 *
 * Every other scenario has the caller reciting their phone in the second turn,
 * so none of them can tell whether Telma would have asked. That matters now:
 * she no longer asks when the network gives her the number, and the branch
 * where it does not — withheld number, switchboard, a badly configured VoIP
 * line, a call from abroad — has never been run.
 *
 * The failure it is looking for does not look like a failure. The booking gets
 * made, the transcript reads well, and the clinic finds out on the day that
 * there is no way to ring the patient.
 */
const CLINIC = {
  clinic_name: 'Clínica Dental Sonrisa',
  specialty: 'Clínica dental',
  address: 'Calle Mayor 3, Madrid',
  phone: '+34910000000',
  timezone: 'Europe/Madrid',
  professionals: [],
  caller_id: null,
  veterinary: false,
  services: ['Revisión', 'Limpieza', 'Empastes', 'Ortodoncia'],
  custom_services: null,
  opening_hours: ['Jueves: 09:00-20:00', 'Viernes: 09:00-20:00'],
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
}

const THURSDAY = '2026-08-20'

export const shared = {
  language: 'es',
  clinic: CLINIC,
  tools: [
    'tool_6701kzp6904wemhtcakyhcj2y7kb',
    'tool_1701kzp690abegpvsdqqdthbperf',
    'tool_8601kzp690f3fcgtwn2338fm721g',
    'tool_3401kzp690kyem0vp0gdrt6b0gy7',
    'tool_5301kzp690rye3kbgkk7kk17v6rn',
  ],
  dynamicVariables: {
    clinic_id: '11111111-1111-1111-1111-111111111111',
    system__conversation_id: 'sim-telefone',
    system__caller_id: '+34644111222',
    system__call_duration_secs: '180',
    clinic_name: 'Clínica Dental Sonrisa',
    clinic_timezone: 'Europe/Madrid',
    clinic_language: 'es',
    can_book: 'true',
    prompt_version: 'sim',
    fallback_number: '+34910000000',
    emergency_number: '',
  },
  toolMocks: {
    telma_ver_marcacoes_demo: { is_patient: false, appointments: [] },
    telma_horas_livres_demo: {
      days_with_slots: [THURSDAY],
      duration_minutes: 30,
      slots: [
        { slot_start: `${THURSDAY}T08:00:00Z`, local_time: '10:00', say: 'jueves 20 a las diez de la mañana' },
        { slot_start: `${THURSDAY}T16:00:00Z`, local_time: '18:00', say: 'jueves 20 a las seis de la tarde' },
      ],
    },
    telma_reservar_hora_demo: { ok: true },
    telma_registar_chamada_demo: { ok: true, call_id: 'sim' },
  },
  firstMessage: 'Hola, quería pedir cita para una limpieza.',

  criteria: [
    {
      id: 'cita_con_telefono',
      name: 'cita con telefono',
      // Money and safety: a booking nobody can be rung about is barely a
      // booking, and it is invisible from the transcript.
      threshold: 1,
      conversation_goal_prompt:
        'Al terminar la llamada, ¿quedó la cita con un número de teléfono de contacto, dicho en voz alta por la agente o por el llamante? Falla si la conversación termina con una cita hecha y ningún teléfono en ninguna parte.',
    },
    {
      id: 'cita_completa_y_coherente',
      name: 'cita completa y coherente',
      threshold: 1,
      // The whole booking, not one field of it. A criterion per field catches a
      // missing phone and misses an appointment for a service nobody asked for,
      // on a day nobody said, under a name that was never given. All four have
      // to be there and all four have to match what was actually said, because
      // a booking that is complete and wrong reaches the clinic looking exactly
      // like a booking that is right.
      conversation_goal_prompt:
        'A lo largo de la llamada, ¿quedaron dichas en voz alta las CUATRO cosas de la cita, y coinciden con lo que pidió el llamante? (1) el nombre de quien viene, (2) un teléfono de contacto, (3) el servicio, (4) el día y la hora. NO hace falta que las cuatro estén en la frase final: basta con que cada una se haya dicho en algún momento y nadie la haya contradicho después. El teléfono, en concreto, se dice una sola vez y no debe repetirse al cerrar. Falla si alguna no se dijo nunca, o si alguna no coincide con lo hablado: un servicio que nadie pidió, un día distinto del acordado, o un nombre que no se dijo.',
    },
    {
      id: 'motivo_sin_palabras_del_paciente',
      name: 'motivo sin palabras del paciente',
      threshold: 1,
      conversation_goal_prompt:
        'El motivo que la agente dejó apuntado para la cita, ¿es el nombre de un servicio de la clínica (por ejemplo "limpieza", "revisión") y NO una descripción de salud en palabras del propio paciente? Falla si apuntó síntomas, dolencias, partes del cuerpo o cualquier cosa que el paciente contara sobre su estado. Falla también si repitió esas palabras al confirmar la cita.',
    },
    {
      id: 'confirma_digitos',
      name: 'confirma digitos',
      threshold: 1,
      conversation_goal_prompt:
        'El número que quedó apuntado, ¿lo repitió la agente en voz alta cifra a cifra y esperó a que el llamante lo confirmara? Falla si lo dio por bueno sin leerlo de vuelta, o si lo leyó agrupado en números grandes.',
    },
  ],
}

export default {
  ...shared,
  caller: `Eres un paciente nuevo pidiendo cita. Hablas con normalidad.
NUNCA das tu número de teléfono por tu cuenta: solo lo dices si te lo piden
expresamente, y entonces dices "seis, cuatro, cuatro, uno, uno, uno, dos, dos, dos".
Te llamas Marta Vidal, quieres una limpieza, el jueves te va bien, aceptas la
primera hora que te ofrezcan, y te despides cuando la agente cierre.`,
}
