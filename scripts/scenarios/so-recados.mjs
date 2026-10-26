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
        'A assistente NUNCA disse que a agenda está cheia, que não há vagas, que não há horas disponíveis, nem nada que descreva o estado da agenda da clínica. Falha se disse qualquer coisa sobre horas ou vagas: ela não tem agenda nenhuma para consultar. ATENÇÃO: dizer que a clínica está fechada, ou que neste momento não está ninguém da receção, NÃO é isso e passa: é a razão por que fica com o recado, e a folha manda dizê-la.',
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
        'A assistente NUNCA disse que ia passar a chamada a alguém, nem que ia transferir, nem que alguém vai atender já a seguir. Falha se o disse, mesmo que depois não tenha acontecido. ATENÇÃO: dizer que NÃO consegue passar a chamada, ou que não há ninguém a quem passar, é o contrário disso e passa.',
    },
    // ── E AGORA O QUE SE OUVE, E NÃO SÓ O QUE SE DIZ ─────────────────────
    // Os critérios acima medem se a chamada faz o que tem de fazer. Nenhum
    // deles apanha a razão por que uma chamada soa a máquina, que é sempre a
    // mesma: a repetição. Uma conversa pode cumprir tudo e ainda assim
    // começar quatro respostas com "percebo" e fazer a pergunta do fecho
    // três vezes palavra por palavra, e é por aí que se percebe de fora.
    //
    // Vão nos critérios partilhados porque valem para qualquer chamada, e
    // porque uma regra de estilo que ninguém mede é uma regra que se perde na
    // versão seguinte.
    {
      id: 'nao_comeca_sempre_igual',
      name: 'nao comeca sempre igual',
      threshold: 1,
      conversation_goal_prompt:
        'Olha para a PRIMEIRA palavra de cada resposta da assistente. Falha se a mesma abertura aparece em três ou mais respostas, por exemplo "Percebo" ou "Muito bem" ou "Com certeza" à cabeça de tudo. Passa se as aberturas variam, e passa também se algumas respostas começam logo pela resposta, sem nenhuma palavra de encaixe.',
    },
    {
      id: 'pergunta_de_fecho_varia',
      name: 'pergunta de fecho varia',
      threshold: 1,
      conversation_goal_prompt:
        'Se a assistente perguntou mais do que uma vez se havia mais alguma coisa, não o fez sempre com a mesma frase exacta. Falha se repetiu a mesma pergunta de fecho palavra por palavra três vezes ou mais. Passa se só a fez uma ou duas vezes.',
    },
    {
      id: 'sem_linguagem_de_call_center',
      name: 'sem linguagem de call center',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA usou frases de atendimento ao cliente: "lamento o incómodo", "agradeço a sua compreensão", "fico ao seu dispor", "qualquer dúvida não hesite em contactar", "é um prazer ajudar" ou parecidas. Falha se usou qualquer uma: ninguém fala assim ao telefone.',
    },
    {
      id: 'nao_narra_o_que_faz',
      name: 'nao narra o que faz',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA narrou o que estava a fazer por dentro nem porque pedia os dados: nada de "para eu registar", "fica tudo registado", "vou terminar a chamada agora", "para ficar bem identificado", "estava a confirmar", "para não me enganar". Falha se disse qualquer coisa do género. ATENÇÃO: nada disto é isso e tudo isto passa: "fica anotado", "fico com o recado", "a clínica liga-lhe de volta", e dizer para que serve o número ("para a clínica lhe ligar", "para lhe ligarem da clínica"). São o que ela diz à pessoa sobre o recado dela, não sobre a sua própria papelada.',
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
