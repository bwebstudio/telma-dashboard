/**
 * Alguém a escrever, não a falar, e a querer uma consulta.
 *
 * O primeiro cenário do add-on, e é o do folheto: "o paciente escreve e ela
 * marca". Uma clínica com agenda, porque é só a essas que o add-on se vende --
 * numa clínica de recados a resposta chega horas depois, fora da janela das
 * vinte e quatro horas, onde só passa uma plantilla aprovada.
 *
 * Corre-se com --whatsapp, que é o que troca a metade da folha que é sobre
 * falar pela secção que diz que isto é por escrito. Sem a flag, este mesmo
 * cenário é uma chamada, e serve para ler as duas uma ao lado da outra.
 */
const CLINIC = {
  clinic_name: 'Clínica Dentária Sorriso',
  specialty: 'Clínica dentária',
  address: 'Rua das Flores 12, Lisboa',
  phone: '+351213000000',
  timezone: 'Europe/Lisbon',
  professionals: [],
  caller_id: '+351912000111',
  known_patient: null,
  veterinary: false,
  services: ['Consulta de avaliação (30 min, 45 €)', 'Limpeza / destartarização (45 min, 60 €)', 'Branqueamento'],
  custom_services: null,
  opening_hours: [
    'Segunda: 09:00-13:00, 14:00-19:00',
    'Terça: 09:00-13:00, 14:00-19:00',
    'Quarta: 09:00-13:00, 14:00-19:00',
    'Quinta: 09:00-13:00, 14:00-19:00',
    'Sexta: 09:00-13:00, 14:00-18:00',
  ],
  appointment_duration_minutes: 30,
  languages: ['Português'],
  formality: 'formal',
  price_info: null,
  fallback_policy: 'message',
  fallback_number: null,
  briefing: null,
  // Com agenda, que é a única forma em que este add-on se vende.
  can_book: true,
  takes_bookings: true,
  within_opening_hours: true,
  emergency_number: null,
  emergency_protocol: null,
  recording: false,
  appointments_auto_confirmed: true,
  after_hours_transfer: false,
  after_hours_patients_only: true,
  after_hours_number: null,
}

// A segunda e a terça seguintes, escritas por extenso para que as horas
// finjidas e a paciente simulada falem do mesmo dia.
const MONDAY = '2026-11-02'
const TUESDAY = '2026-11-03'

export default {
  language: 'pt',
  clinic: CLINIC,
  dynamicVariables: {
    clinic_id: '11111111-1111-1111-1111-111111111111',
    system__conversation_id: 'sim-whatsapp-marcacao',
    system__caller_id: '+351912000111',
    system__call_duration_secs: '0',
    clinic_name: CLINIC.clinic_name,
    clinic_timezone: 'Europe/Lisbon',
    clinic_language: 'pt',
    can_book: 'true',
    prompt_version: 'sim',
    fallback_number: '',
    emergency_number: '',
  },
  // As cinco do telefone, que são as mesmas cinco que a cabeça de texto chama.
  // A sexta, passar a chamada, não existe por escrito: não há chamada para
  // passar.
  tools: [
    'tool_6701kzp6904wemhtcakyhcj2y7kb', // horas livres
    'tool_1701kzp690abegpvsdqqdthbperf', // reservar hora
    'tool_8601kzp690f3fcgtwn2338fm721g', // ver marcações
    'tool_3401kzp690kyem0vp0gdrt6b0gy7', // cancelar marcação
    'tool_5301kzp690rye3kbgkk7kk17v6rn', // registar chamada
  ],

  // Finjidas, para que isto não escreva nada na agenda da demo e para que as
  // horas sejam sempre as mesmas de uma passagem para a outra.
  toolMocks: {
    telma_ver_marcacoes_demo: { is_patient: false, appointments: [] },
    telma_horas_livres_demo: {
      faz: true,
      days_with_slots: [MONDAY, TUESDAY],
      duration_minutes: 45,
      // `say` escrito e não dito, que é como /api/availability o devolve quando
      // lhe chega `channel=whatsapp`. Posto aqui na mesma forma, senão este
      // cenário mede horas que em produção não chegam assim.
      slots: [
        { slot_start: `${MONDAY}T09:00:00Z`, local_time: '09:00', say: 'segunda-feira, 2 de novembro às 9h' },
        { slot_start: `${MONDAY}T15:30:00Z`, local_time: '15:30', say: 'segunda-feira, 2 de novembro às 15h30' },
        { slot_start: `${TUESDAY}T10:00:00Z`, local_time: '10:00', say: 'terça-feira, 3 de novembro às 10h' },
      ],
    },
    telma_reservar_hora_demo: { ok: true, held_until: '2026-11-02T08:10:00Z' },
    telma_registar_chamada_demo: { ok: true },
  },

  firstMessage: 'Boa tarde, queria marcar uma limpeza.',
  caller: `Escreves pelo WhatsApp à clínica, com frases curtas como se escrevem
numa mensagem, às vezes sem pontuação. Queres marcar uma limpeza.
Chamas-te Teresa Marques. Se te oferecerem horas, escolhes a segunda.
Se te pedirem o telefone, escreves "912000111". Despedes-te quando ela fechar.`,
  criteria: [
    {
      id: 'nao_le_numeros_de_volta',
      name: 'nao le numeros de volta',
      threshold: 1,
      conversation_goal_prompt:
        'Como isto é por escrito, a assistente NÃO leu o número de telefone de volta algarismo a algarismo nem pediu para o confirmar cifra a cifra. Falha se escreveu o número separado por vírgulas ("nove, um, dois...") ou se pediu confirmação dos algarismos: num ecrã o número está à vista de quem o escreveu.',
    },
    {
      id: 'nao_fala_de_desligar',
      name: 'nao fala de desligar',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NUNCA falou como se estivesse ao telefone. Falha se escreveu "um momento", "só um segundo", "já lhe digo", "vou consultar a agenda", "está aí?", "obrigada por ligar" ou qualquer frase sobre ligar, atender ou desligar. "Tenha uma boa tarde" e "obrigada pela mensagem" NÃO são falhas: despedir-se é normal também por escrito.',
    },
    {
      id: 'mensagens_curtas',
      name: 'mensagens curtas',
      threshold: 1,
      conversation_goal_prompt:
        'Cada mensagem da assistente tem no máximo três ou quatro linhas e faz no máximo uma pergunta. Falha se alguma mensagem é um parágrafo comprido, se traz uma lista numerada, ou se faz duas perguntas de uma vez.',
    },
    {
      // A apresentação não é dela: `composeReply` põe-na à frente da primeira
      // resposta da conversa, como `greetingLine` faz ao telefone, porque
      // pedida à folha saía uma vez em três. Por isso o que se mede aqui é o
      // contrário -- que ela não a escreva --, senão o paciente lê duas.
      id: 'nao_se_apresenta_ela',
      name: 'nao se apresenta ela',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente NÃO se apresentou a si mesma: não escreveu "sou a Telma", "a assistente virtual" nem nada do género em nenhuma mensagem. Falha se o fez. A apresentação é acrescentada pelo sistema antes da primeira resposta e não é trabalho dela.',
    },
    // ── E UM QUE NÃO SE MEDE AQUI ──────────────────────────────────────────
    // Faltava um critério sobre as horas em algarismos ("às 09:00" e não "às
    // nove da manhã"), e correu três vezes a zero com as horas já escritas em
    // algarismos dentro da resposta finjida. O agente desta simulação é um
    // agente de voz: a plataforma passa os algarismos a palavras antes de os
    // entregar ao sintetizador, e isso acontece depois da folha e fora do nosso
    // alcance. Media a plataforma, não a Telma.
    //
    // Em produção isto não é uma regra da folha, é o campo: /api/availability
    // devolve `say` já escrito quando lhe chega `channel=whatsapp` (ver
    // lib/whatsapp-tools) e a folha manda copiá-lo tal e qual. Quem o confirma
    // de ponta a ponta é scripts/simulate-whatsapp.mjs, que corre o modelo que
    // responde de verdade.
    {
      id: 'marca_de_verdade',
      name: 'marca de verdade',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente ofereceu horas concretas e, depois de a pessoa escolher uma, disse que a consulta ficou marcada para esse dia e hora. Falha se nunca ofereceu horas, se as inventou sem consultar, ou se acabou a conversa sem dizer que ficou marcada.',
    },
    // ── E ESTES VÊM DA CHECKLIST DO GUIA ───────────────────────────────────
    // §19, a lista com que o guia manda aprovar ou recusar uma resposta.
    // Postos aqui os que uma simulação consegue julgar: os outros ("poderia
    // ser mais curta?") são de uma pessoa a ler.
    {
      id: 'sem_linguagem_de_oficio',
      name: 'sem linguagem de oficio',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente nunca escreveu linguagem burocrática nem de atendimento ao cliente. Falha se usou "procederei", "a sua solicitação", "efetuado com sucesso", "de acordo com os dados do sistema", "informamos que", "agradecemos o seu contacto", "fico ao seu dispor", "qualquer dúvida não hesite", ou a palavra "agendamento"/"agendar" em vez de marcar/marcação.',
    },
    {
      id: 'responde_antes_de_oferecer',
      name: 'responde antes de oferecer',
      threshold: 1,
      conversation_goal_prompt:
        'Sempre que a pessoa fez uma pergunta — um preço, um horário, se a clínica faz um tratamento — a assistente respondeu a essa pergunta ANTES de propor marcar ou oferecer horas. Falha se alguma vez respondeu a uma pergunta com uma oferta de marcação sem a ter respondido primeiro. Se a pessoa não fez perguntas destas, passa.',
    },
    {
      id: 'sem_narrar_ferramentas',
      name: 'sem narrar ferramentas',
      threshold: 1,
      conversation_goal_prompt:
        'A assistente nunca falou do que faz por dentro: nada de nomes de ferramentas, campos, sistema, agenda como software, IDs ou integrações. Falha se escreveu qualquer um, incluindo "vou registar na agenda" ou "fica no sistema".',
    },
  ],
}
