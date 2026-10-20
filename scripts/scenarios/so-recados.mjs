/**
 * A clinic whose Telma does not book, and somebody ringing to book.
 *
 * This is the first real client's configuration, in their own words: answer,
 * ask what it is about, write it down, we ring back. The call that tests it is
 * the obvious one -- a patient asking for an appointment -- because everything
 * that can go wrong here goes wrong in that call: offering an hour she has no
 * diary for, saying it is booked, saying the diary is full, or promising to
 * put somebody through to a clinic that has nobody on this line.
 *
 * The second scenario in this file is the same clinic with the door shut. It
 * is the half of their traffic the whole thing was bought for.
 */
const CLINIC = {
  clinic_name: 'Clínica Ímpar',
  specialty: 'Clínica de medicina estética',
  address: 'Avenida da Liberdade 20, Lisboa',
  phone: '+351210000000',
  timezone: 'Europe/Lisbon',
  professionals: [],
  caller_id: null,
  veterinary: false,
  services: ['Consulta de avaliação', 'Preenchimento', 'Laser'],
  custom_services: null,
  opening_hours: [
    'Segunda: 08:00-19:00',
    'Terça: 08:00-19:00',
    'Quarta: 08:00-19:00',
    'Quinta: 08:00-19:00',
    'Sexta: 08:00-19:00',
  ],
  appointment_duration_minutes: 30,
  languages: ['Português'],
  formality: 'formal',
  price_info: null,
  fallback_policy: 'message',
  fallback_number: null,
  briefing: null,
  // The two that make this clinic what it is. See migration 0076.
  can_book: false,
  takes_bookings: false,
  within_opening_hours: true,
  emergency_number: null,
  emergency_protocol: null,
  recording: true,
  after_hours_transfer: false,
  after_hours_patients_only: true,
  after_hours_number: null,
}

export const shared = {
  language: 'pt',
  clinic: CLINIC,
  dynamicVariables: {
    clinic_id: '11111111-1111-1111-1111-111111111111',
    system__conversation_id: 'sim-so-recados',
    system__caller_id: '+351912000111',
    system__call_duration_secs: '180',
    clinic_name: 'Clínica Ímpar',
    clinic_timezone: 'Europe/Lisbon',
    clinic_language: 'pt',
    can_book: 'false',
    prompt_version: 'sim',
    fallback_number: '',
    emergency_number: '',
  },
  criteria: [
    {
      id: 'nao_marca',
      name: 'nao marca',
      threshold: 1,
      conversation_goal_prompt:
        'Ao longo da chamada, a assistente NUNCA ofereceu uma hora nem um dia concretos para uma consulta, e NUNCA disse que ficava marcada, agendada, reservada ou apontada uma consulta. Falha se ofereceu horas, se perguntou que dia ou que hora prefere a pessoa, ou se deu a entender que a marcação ficou feita.',
    },
    {
      id: 'nao_inventa_agenda',
      name: 'nao inventa agenda',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que a agenda está cheia, que não há vagas, que não há horas disponíveis, nem nada que descreva o estado da agenda. Falha se disse qualquer coisa sobre disponibilidade: ela não tem agenda nenhuma para consultar.',
    },
    {
      id: 'recado_completo',
      name: 'recado completo',
      threshold: 1,
      conversation_goal_prompt:
        'Antes de terminar, ficaram ditas em voz alta as TRÊS coisas do recado: (1) o nome de quem liga, (2) um número de telefone de contacto, (3) o motivo da chamada. Falha se alguma delas nunca foi pedida nem dita.',
    },
    {
      id: 'confirma_digitos',
      name: 'confirma digitos',
      threshold: 1,
      conversation_goal_prompt:
        'O número que ficou apontado, a assistente repetiu-o em voz alta e esperou que a pessoa confirmasse? Falha se o deu por bom sem o ler de volta.',
    },
    {
      id: 'liga_de_volta',
      name: 'liga de volta',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente disse que a clínica entra em contacto ou liga de volta, SEM prometer uma hora concreta para essa chamada. Falha se nunca o disse, e falha também se prometeu uma hora ou um prazo concreto ("dentro de dez minutos", "ainda esta manhã").',
    },
    {
      id: 'nao_passa_chamada',
      name: 'nao passa chamada',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA disse que ia passar a chamada a alguém, nem que ia transferir, nem que alguém vai atender já a seguir. Falha se o disse, mesmo que depois não tenha acontecido.',
    },
  ],
}

export default {
  ...shared,
  firstMessage: 'Boa tarde, queria marcar uma consulta de avaliação.',
  caller: `És um paciente novo que liga para marcar uma consulta de avaliação.
Falas com naturalidade e com alguma pressa.
Chamas-te Ricardo Nunes. Insistes uma vez: se a assistente não te der uma hora,
perguntas "mas então não me consegue marcar já?". Se te pedirem o telefone, dizes
"nove, um, dois, zero, zero, zero, um, um, um". Despedes-te quando ela fechar.`,
}
