import type { OnboardingLocale } from './locale'

/**
 * The sign-up's words, in Portuguese and Spanish.
 *
 * Not in content/{pt,es,en}.ts with everything else, and the reason is
 * structural rather than lazy: that dictionary is chosen by `getLocale()`,
 * which reads the signed in user, and nobody is signed in here. The language of
 * this screen is decided from the URL, a cookie and the browser, in
 * lib/onboarding/locale.ts.
 *
 * Both languages are formal throughout. The reader is a clinic owner being
 * asked for a card number, not a consumer being onboarded into an app.
 */

export interface StepMeta {
  n: number
  short: string
  title: string
  help: string
}

export interface Copy {
  steps: StepMeta[]
  /** The screen between the last question and the charge. */
  summaryTitle: string
  summaryLead: string
  summaryPlanLine: (plan: string, cycle: string) => string
  summaryWhatsapp: string
  summaryCycleMonthly: string
  summaryCycleAnnual: string
  summaryPerMonth: string
  summaryPerYear: string
  summarySubtotal: string
  summaryTaxUnknown: string
  summaryReverseCharge: string
  /** The forwarding number, repeated where everything else is confirmed. */
  summaryForwardFromLabel: string
  summaryForwardFrom: string
  summaryTotal: string
  summaryTotalNow: string
  /** When an implementation week comes first, nothing is charged today
   *  and the figure above is what starts a week later. */
  summaryTrialNote: (days: number) => string
  summaryRenews: (cycle: string) => string
  summaryCancel: string
  summaryByArrangement: string
  summaryFailed: string
  summaryLoading: string
  summaryBack: string

  pageTitle: string
  /** The browser tab and the page description. */
  metaTitle: string
  metaDescription: string
  intro: string
  introLead: string
  savedNotice: string
  startOver: string
  startOverConfirm: string
  languageLabel: string

  next: string
  back: string
  submit: string
  submitting: string
  stepOf: string

  errorGeneric: string
  errorFix: string
  errorSubmit: string
  errorEmailTaken: string
  errorPhoneTaken: string
  errorEmailStaff: string

  clinicName: string
  clinicNameHelp: string
  email: string
  emailHelp: string
  /** The example inside the email field. */
  emailPlaceholder: string
  /** The same field on /conta, where it is the clinic's contact address and
   *  changing it does not change the login. */
  contactEmail: string
  contactEmailHelp: string
  phone: string
  phoneHelp: string
  specialty: string
  country: string
  region: string
  choose: string

  weekdays: string
  saturday: string
  sunday: string
  closed: string
  opens: string
  closes: string
  pause: string
  pauseHelp: string
  pauseStart: string
  pauseEnd: string
  duration: string
  durationHelp: string
  interval: string
  intervalHelp: string
  minutes: string

  servicesHelp: string
  customServices: string
  customServicesHelp: string
  /** Per-service lengths. Folded away by default: most clinics never open it,
   *  and a table of numbers on the way in is how a sign-up gets abandoned. */
  durationsToggle: string
  durationsHelp: string
  durationsUnit: string
  durationsDefault: (minutes: number) => string
  detailsService: string
  detailsDuration: string
  detailsPrice: string
  detailsNotes: string

  address: string
  addressHelp: string
  priceInfo: string
  priceInfoHelp: string
  priceInfoPlaceholder: string
  groupDoes: string
  groupDoesLead: string
  booksYes: string
  booksYesHelp: string
  booksNo: string
  booksNoHelp: string
  groupVoice: string
  groupVoiceLead: string
  groupStuck: string
  groupStuckLead: string
  groupUrgent: string
  groupUrgentLead: string
  groupExtra: string
  groupExtraLead: string
  greetingLanguage: string
  greetingLanguageHelp: string
  formality: string
  formalityHelp: string
  formalityFormal: string
  formalityInformal: string
  fallback: string
  fallbackHelp: string
  fallbackTransfer: string
  fallbackTransferHelp: string
  fallbackMessage: string
  fallbackMessageHelp: string
  fallbackNumber: string
  briefing: string
  briefingHelp: string
  briefingPlaceholder: string
  emergency: string
  emergencyHelp: string
  emergencyNumber: string
  emergencyNumberHelp: string
  emergencyProtocol: string
  emergencyProtocolHelp: string
  emergencyProtocolPlaceholder: string
  emergencyNone: string
  afterHours: string
  afterHoursHelp: string
  afterHoursOff: string
  afterHoursOn: string
  afterHoursNumber: string
  afterHoursNumberHelp: string
  afterHoursPatientsOnly: string
  afterHoursPatientsOnlyHelp: string
  afterHoursNumberRequired: string
  languages: string
  languagesHelp: string
  languagesCount: string
  languagesSoon: string
  languagesFull: string
  errorTooManyLanguages: string
  /** One language, and several: `1 idioma`, `2 idiomas`. */
  planLanguage: string
  planLanguages: string
  /** Each plan's line, in the reader's language. The `plans` table has one
   *  description, in Portuguese; this is what the sign-up shows instead. */
  planDescriptions: Record<'essencial' | 'clinica' | 'rede', string>
  planTooFewLanguages: string

  keepNumber: string
  keepNumberHelp: string
  /** Shown instead of the two cards while a new number cannot be bought
   *  in either country. See NEW_NUMBERS_ON_SALE in ./catalog. */
  keepOnlyHelp: string
  newNumber: string
  newNumberHelp: string
  currentNumber: string
  /** The one answer the whole forward depends on. Telma recognises a
   *  clinic's calls by the number they were forwarded from, so this is
   *  not a detail of the record: it is the identifier. */
  currentNumberHelp: string
  operator: string
  /** The last option of the operator list, in the reader's language. The
   *  list itself follows the clinic's country, not the language. */
  operatorOther: string
  /** Which calls reach her. The expensive answer is the one a clinic would
   *  otherwise get by default, so it is asked rather than assumed. */
  forwardTitle: string
  forwardNoAnswer: string
  forwardNoAnswerHelp: string
  forwardAll: string
  forwardAllHelp: string
  areaRegion: string
  portingNote: string

  planMonthly: string
  planAnnual: string
  planAnnualHint: string
  perMonth: string
  perYear: string
  includedMinutes: string
  locations: string
  addonWhatsapp: string
  addonWhatsappHelp: string
  /** Shown instead of a tick while the add-on is not on sale. The same
   *  word /conta uses for it, so the two screens agree. */
  addonWhatsappSoon: string
  needMore: string
  needMoreLink: string
  terms: string
  paymentNote: string
  paymentNoteDemo: string

  doneEyebrow: string
  doneTitle: string
  doneLead: string
  doneDemo: string
  doneNumber: string
  donePorting: string
  donePendingTitle: string
  donePendingBody: string
  donePortingNote: string
  doneCredentials: string
  donePassword: string
  donePasswordHelp: string
  doneOpenPanel: string
  /** Under the preview on the final screen, where there is no step to go
   *  back to: what was entered can be changed later in the panel. */
  donePreviewHelp: string
  doneNextTitle: string
  doneNext: string[]
  /** The third step, once it is known whether the clinic kept its number. */
  doneNextKeep: string
  doneNextNew: string
  /** The third step where it is not known: the page Stripe returns to. */
  doneNextEither: string
  copy: string
  copied: string

  haveAccount: string
  legalTerms: string
  legalPrivacy: string
  byBweb: string

  thanksTitle: string
  thanksLead: string
  thanksNoEmail: string
  thanksReference: string
}

const pt: Copy = {
  steps: [
    { n: 1, short: 'Plano', title: 'O plano', help: 'Sem permanência. Pode mudar de plano ou cancelar quando quiser.' },
    { n: 2, short: 'Clínica', title: 'A sua clínica', help: 'Os dados básicos da clínica. Os horários, os serviços e os restantes detalhes configuram-se depois no painel.' },
    { n: 3, short: 'Número', title: 'O número', help: 'Escolha se quer manter o número atual da clínica ou usar um número novo.' },
    { n: 4, short: 'Resumo', title: 'O que vai pagar', help: 'Confira os dados antes de avançar para o pagamento.' },
  ],
  summaryTitle: 'O que vai pagar',
  summaryLead: 'Confira o plano e o valor. O pagamento é feito na Stripe no passo seguinte.',
  summaryPlanLine: (plan, cycle) => `Plano ${plan}, ${cycle}`,
  summaryWhatsapp: 'WhatsApp',
  summaryCycleMonthly: 'mensal',
  summaryCycleAnnual: 'anual',
  summaryPerMonth: 'por mês',
  summaryPerYear: 'por ano',
  summarySubtotal: 'Subtotal',
  summaryTaxUnknown: 'Calculado no pagamento',
  summaryReverseCharge:
    'Inversão do sujeito passivo: a fatura sai sem IVA e a sua clínica autoliquida-o na sua declaração. Pedimos-lhe o NIF na página de pagamento.',
  summaryForwardFromLabel: 'O número da sua clínica',
  summaryForwardFrom:
    'É deste número que vai desviar as chamadas, e é por ele que a Telma sabe que são da sua clínica. Confirme que está certo: se o desvio sair de outra linha, as chamadas chegam sem dizer de quem são. Pode voltar atrás e corrigi-lo agora.',
  summaryTotal: 'Total',
  summaryTotalNow: 'Total a pagar hoje',
  summaryTrialNote: (d: number) =>
    `Hoje não paga nada. A primeira cobrança é daqui a ${d} dias, depois da semana de implementação. O cartão fica guardado para isso.`,
  summaryRenews: (cycle) => `A subscrição renova ${cycle === 'annual' ? 'anualmente' : 'mensalmente'}.`,
  summaryCancel: 'Sem permanência. Pode cancelar quando quiser a partir do painel.',
  summaryByArrangement: 'Este plano requer um orçamento personalizado. Entraremos em contacto consigo depois da inscrição.',
  summaryFailed: 'Não foi possível calcular o valor neste momento. Pode continuar: verá o valor exato na Stripe antes de confirmar o pagamento.',
  summaryLoading: 'A calcular...',
  summaryBack: 'Corrigir alguma coisa',

  pageTitle: 'Inscrição',
  metaTitle: 'Inscrição · Telma',
  metaDescription: 'Inscreva a sua clínica na Telma em poucos passos.',
  intro: 'A Telma atende o seu telefone',
  introLead:
    'Em poucos passos, indique os dados essenciais da sua clínica. Depois, configura no painel os horários, os serviços e a forma como a Telma atende.',
  savedNotice: 'As suas respostas ficam guardadas. Pode fechar e voltar mais tarde.',
  startOver: 'Começar de novo',
  startOverConfirm: 'Isto apaga as respostas que já guardou e volta ao primeiro passo. Quer continuar?',
  languageLabel: 'Idioma',

  next: 'Continuar',
  back: 'Voltar',
  submit: 'Confirmar inscrição',
  submitting: 'A criar a sua clínica...',
  stepOf: 'Passo {n} de {total}',

  errorGeneric: 'Não foi possível guardar. Tente novamente.',
  errorFix: 'Verifique os campos assinalados.',
  errorSubmit:
    'Não foi possível concluir a inscrição. Nada foi cobrado. Tente novamente ou fale connosco.',
  errorEmailTaken:
    'Já existe uma clínica com este email. Entre na sua conta ou use outro email.',
  errorEmailStaff:
    'Este email já está associado a outra conta da Telma. Use um email diferente para a clínica.',
  errorPhoneTaken:
    'Este número já está associado a uma clínica na Telma. Se for a sua, entre no painel. Se achar que é um erro, fale connosco.',

  clinicName: 'Nome da clínica',
  clinicNameHelp: 'É este o nome que a Telma usa ao atender.',
  email: 'Email de acesso',
  emailHelp: 'É para este email que enviamos os acessos e as comunicações sobre a conta.',
  emailPlaceholder: 'geral@clinicaserrano.pt',
  contactEmail: 'Email da receção',
  contactEmailHelp: 'Para onde enviamos os acessos.',
  phone: 'Telefone de contacto',
  phoneHelp: 'O número de contacto da clínica. Usamo-lo se precisarmos de falar consigo sobre a configuração ou o serviço.',
  specialty: 'Área da clínica',
  country: 'País',
  region: 'Distrito',
  choose: 'Escolha uma opção',

  weekdays: 'Segunda a sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
  closed: 'Encerrado',
  opens: 'Abre',
  closes: 'Fecha',
  pause: 'Pausa para almoço',
  pauseHelp: 'A Telma não marca nada a estas horas. Aplica-se a todos os dias em que a clínica abre.',
  pauseStart: 'Início',
  pauseEnd: 'Fim',
  duration: 'Quanto dura uma consulta',
  durationHelp:
    'O tempo que a Telma reserva na agenda para cada pessoa. Com 30 minutos, uma consulta das 9:00 ocupa até às 9:30.',
  interval: 'A que horas pode começar uma consulta',
  intervalHelp:
    'De quanto em quanto tempo abre um horário. Com 30 minutos, a Telma oferece as 9:00, as 9:30, as 10:00. Normalmente é igual à duração acima.',
  minutes: 'minutos',

  servicesHelp: 'Pode escolher vários.',
  customServices: 'Outros serviços',
  customServicesHelp: 'Um por linha. Opcional.',
  durationsToggle: 'Duração e preço de cada serviço',
  durationsHelp:
    'Tudo opcional. A duração é o tempo que a Telma deixa livre na agenda, para não marcar uma sessão de uma hora num espaço de vinte minutos. O preço só o diz se o escrever aqui. Pode mudar isto quando quiser no seu painel.',
  durationsUnit: 'min',
  durationsDefault: (m) => `${m} min`,
  detailsService: 'Serviço',
  detailsDuration: 'Duração',
  detailsPrice: 'Preço',
  detailsNotes: 'Alguma coisa sobre preços que não caiba num número',

  address: 'Morada',
  addressHelp: 'A morada que a Telma pode indicar a quem liga.',
  priceInfo: 'Preços',
  priceInfoHelp: 'Opcional, e só para o que não cabe num número: "o laser varia com a zona", "o primeiro orçamento é gratuito". Os preços de cada serviço põem-se em cima.',
  priceInfoPlaceholder: 'Primeira consulta 40 €. Limpeza a partir de 60 €.',
  groupDoes: 'Marcar consultas',
  groupDoesLead: 'O que a Telma faz quando alguém liga a pedir uma hora.',
  booksYes: 'Atende e marca consultas',
  booksYesHelp: 'Vê a agenda, oferece as horas livres e deixa a marcação no painel. É para isto que ela serve.',
  booksNo: 'Atende e toma recados',
  booksNoHelp: 'Nunca oferece horas nem marca nada. Pergunta o motivo da chamada, toma nota e diz que a clínica liga de volta. Pode ativar as marcações quando quiser, e a agenda volta ao menu.',
  groupVoice: 'Como fala',
  groupVoiceLead: 'Em que língua abre a chamada e como trata quem liga.',
  groupStuck: 'Quando não consegue ajudar',
  groupStuckLead: 'Vai acontecer. O que decide aqui é o que ela faz nesse momento.',
  groupUrgent: 'Urgências e fora de horas',
  groupUrgentLead: 'As duas situações em que uma marcação não serve de nada.',
  groupExtra: 'O resto',
  groupExtraLead: 'O que nenhuma pergunta acima previu.',
  greetingLanguage: 'Idioma com que atende',
  greetingLanguageHelp:
    'O primeiro que se ouve, antes de quem liga dizer nada. Se a clínica atende em mais línguas, a saudação diz como pedi-las, e a partir daí a Telma não muda de língua durante a chamada.',
  formality: 'Como trata os pacientes',
  formalityHelp: 'A primeira coisa que se nota ao telefone.',
  formalityFormal: 'Por "o senhor" / "a senhora"',
  formalityInformal: 'Por "tu"',
  fallback: 'Quando a Telma não consegue ajudar',
  fallbackHelp: 'Vai acontecer. O que decide aqui é o que ela faz nesse momento.',
  fallbackTransfer: 'Passa a chamada a uma pessoa',
  fallbackTransferHelp: 'Avisa antes de passar. Precisa de um número que atenda.',
  fallbackMessage: 'Toma nota e a clínica liga de volta',
  fallbackMessageHelp: 'Pede o nome, o número e o motivo, e repete o número para confirmar. Diz que a clínica liga de volta, sem prometer hora certa. Fica tudo registado no painel.',
  fallbackNumber: 'Número para onde passar',
  briefing: 'Mais alguma coisa que a Telma deva saber',
  briefingHelp: 'Opcional, e é onde cabe o que nenhum campo acima previu. Vai tal e qual para a Telma.',
  briefingPlaceholder: 'Estacionamento na rua de trás.\nAceitamos Multicare e Médis.\nA Dra. Sofia não atende às quintas.',
  emergency: 'Urgências',
  emergencyHelp: 'Quem liga com dor forte, uma hemorragia ou um inchaço não quer hora para quinta-feira. A Telma passa a chamada de imediato e nunca oferece uma marcação nesses casos, mesmo que a clínica esteja sem minutos.',
  emergencyNumber: 'Número de urgência',
  emergencyNumberHelp: 'Para onde a Telma passa a chamada. Fora de horas, é o número que ela dá para ligar nesse momento.',
  emergencyProtocol: 'O que fazer numa urgência',
  emergencyProtocolHelp: 'Opcional. As suas indicações, sobretudo para fora de horas.',
  emergencyProtocolPlaceholder: 'Fora de horas, encaminhar para a urgência do Hospital X.',
  emergencyNone: 'Se deixar o número em branco, fora de horas a Telma diz que a clínica está fechada e encaminha para um serviço de urgência. Nunca inventa um número.',
  afterHours: 'Chamadas fora do horário',
  afterHoursHelp: 'O que a Telma faz quando alguém liga com o consultório fechado. Por omissão não incomoda ninguém.',
  afterHoursOff: 'Fora de horas, ninguém é incomodado. A Telma dá o número de urgências acima e explica quando a clínica reabre.',
  afterHoursOn: 'Aceito que me passem chamadas fora do horário',
  afterHoursNumber: 'Número para fora de horas',
  afterHoursNumberHelp: 'Para onde vai a chamada de madrugada. Em branco, usa-se o número de urgências acima.',
  afterHoursPatientsOnly: 'Só a quem já é paciente',
  afterHoursPatientsOnlyHelp: 'A Telma confirma que quem liga já teve consulta aqui antes de passar seja o que for. Recomendado: sem isto, qualquer pessoa pode fazer tocar este número às três da manhã.',
  afterHoursNumberRequired: 'Indique para onde vai a chamada, ou aqui ou no número de urgências.',
  languages: 'Em que idiomas atende a Telma',
  languagesHelp: 'A Telma reconhece a língua de quem liga e responde nela. O seu plano inclui um número de idiomas; escolha quais.',
  languagesCount: '{n} de {max} escolhidos',
  languagesSoon: 'em breve',
  languagesFull: 'Chegou ao máximo desta seleção. Retire um para escolher outro, ou suba de plano no último passo.',
  errorTooManyLanguages: 'Escolheu mais idiomas do que este plano inclui.',
  planLanguage: 'idioma',
  planLanguages: 'idiomas',
  planTooFewLanguages: 'Este plano inclui menos idiomas do que os que escolheu.',
  planDescriptions: {
    essencial: 'Para consultórios pequenos',
    clinica: 'Mais escolhido. Voz personalizada e relatório mensal incluídos.',
    rede: 'Para grupos com várias clínicas. Painel unificado e um número próprio por sede.',
  },

  keepNumber: 'Quero manter o meu número',
  keepNumberHelp:
    'Mantém o número que os seus pacientes já conhecem. Quando a linha da Telma estiver pronta, ajudamo-lo a configurar o desvio das chamadas.',
  keepOnlyHelp:
    'Mantém o número que os seus pacientes já conhecem: é esse que passa as chamadas para a Telma, e não muda nada para quem liga. No fim mostramos-lhe como configurar o desvio. Se precisa mesmo de um número novo, fale connosco antes de avançar.',
  newNumber: 'Quero um número novo da Telma',
  newNumberHelp: 'Pedimos um número da região que escolher. Avisamos por email assim que estiver ativo.',
  currentNumber: 'Número da clínica',
  currentNumberHelp: 'O número habitual da sua clínica, para onde os pacientes ligam.',
  operator: 'Operadora atual',
  operatorOther: 'Outra',
  forwardTitle: 'Que chamadas passam para a Telma',
  forwardNoAnswer: 'Só as chamadas não atendidas',
  forwardNoAnswerHelp:
    'O telefone da clínica toca primeiro. Se estiver ocupado ou ninguém atender, a Telma atende.',
  forwardAll: 'Todas as chamadas',
  forwardAllHelp:
    'As chamadas vão diretamente para a Telma, sem tocar primeiro na clínica. Esta opção utiliza mais minutos do plano.',
  areaRegion: 'Região do novo número',
  portingNote:
    'O seu número atual continua na mesma operadora. A Telma terá um número próprio para receber as chamadas desviadas. Quando a linha estiver pronta, explicamos no painel como configurar o desvio.',

  planMonthly: 'Mensal',
  planAnnual: 'Anual',
  planAnnualHint: 'Dois meses oferecidos',
  perMonth: '/mês',
  perYear: '/ano',
  includedMinutes: 'minutos de chamadas por mês',
  locations: 'sedes incluídas',
  addonWhatsapp: 'Adicionar a Telma ao WhatsApp',
  addonWhatsappHelp: 'A Telma também responde no WhatsApp e pode marcar consultas. 49 €/mês.',
  addonWhatsappSoon: 'Em breve',
  needMore: 'Várias sedes ou mais de 1750 minutos?',
  needMoreLink: 'Fale connosco',
  terms: 'Li e aceito os termos de serviço e a política de privacidade.',
  paymentNote:
    'O pagamento é feito na página segura da Stripe. Os dados do cartão não passam pela Telma.',
  paymentNoteDemo:
    'Modo de demonstração: nenhum cartão é pedido e nada é cobrado. A clínica é criada na mesma.',

  doneEyebrow: 'Inscrição concluída',
  doneTitle: 'A sua clínica está criada',
  doneLead: 'Enviámos os acessos para {email}. Guarde esta página até entrar no painel pela primeira vez.',
  doneDemo:
    'Modo de demonstração: o número é fictício e não foi cobrado nada. Nada disto chega a um cliente real.',
  doneNumber: 'O número que a Telma atende',
  donePorting: 'O número da Telma, para onde vai desviar o seu',
  donePendingTitle: 'O número',
  donePendingBody:
    'Estamos a tratar da ativação do número com a operadora. Avisamos por email assim que estiver ativo. Entretanto, já pode configurar a Telma no painel.',
  donePortingNote: 'O número habitual da clínica não muda. Quando a linha da Telma estiver pronta, explicamos no painel como desviar as chamadas que quiser que ela atenda.',
  doneCredentials: 'Os seus acessos',
  donePassword: 'Palavra-passe temporária',
  donePasswordHelp: 'Esta palavra-passe só é mostrada uma vez. Altere-a depois de entrar.',
  doneOpenPanel: 'Abrir o painel',
  donePreviewHelp: 'Pode alterar estes dados depois no painel.',
  doneNextTitle: 'O que acontece a seguir',
  doneNext: [
    'Configure a clínica no painel: os horários, os serviços e a forma como a Telma atende.',
    'Quando a linha estiver pronta, ative a Telma e faça uma chamada de teste.',
  ],
  doneNextKeep: 'Configure o desvio das chamadas a partir do número habitual da clínica. Explicamos no painel como fazê-lo.',
  doneNextNew: 'Comece a usar o número novo: no site, no Google e nos restantes contactos da clínica.',
  doneNextEither: 'Se manteve o número da clínica, configure o desvio das chamadas. Se escolheu um número novo, comece a divulgá-lo.',
  copy: 'Copiar',
  copied: 'Copiado',

  haveAccount: 'Já tenho conta',
  legalTerms: 'Termos',
  legalPrivacy: 'Privacidade',
  byBweb: 'Telma, por Bweb Studio',

  thanksTitle: 'Pagamento recebido',
  thanksLead:
    'Obrigado. A sua clínica está criada. Enviámos por email os acessos ao painel e a palavra-passe temporária.',
  thanksNoEmail: 'Não recebeu o email? Escreva para',
  thanksReference: 'Referência do pagamento:',
}

const es: Copy = {
  steps: [
    { n: 1, short: 'Plan', title: 'El plan', help: 'Sin permanencia. Puede cambiar de plan o cancelar cuando quiera.' },
    { n: 2, short: 'Clínica', title: 'Su clínica', help: 'Los datos básicos de la clínica. Los horarios, los servicios y el resto de detalles se configuran después en el panel.' },
    { n: 3, short: 'Número', title: 'El número', help: 'Elija si quiere conservar el número actual de la clínica o utilizar uno nuevo.' },
    { n: 4, short: 'Resumen', title: 'Lo que va a pagar', help: 'Revise los datos antes de continuar con el pago.' },
  ],
  summaryTitle: 'Lo que va a pagar',
  summaryLead: 'Revise el plan y el importe. El pago se realiza en Stripe en el paso siguiente.',
  summaryPlanLine: (plan, cycle) => `Plan ${plan}, ${cycle}`,
  summaryWhatsapp: 'WhatsApp',
  summaryCycleMonthly: 'mensual',
  summaryCycleAnnual: 'anual',
  summaryPerMonth: 'al mes',
  summaryPerYear: 'al año',
  summarySubtotal: 'Subtotal',
  summaryTaxUnknown: 'Se calcula al pagar',
  summaryReverseCharge:
    'Inversión del sujeto pasivo: la factura sale sin IVA y su clínica lo autoliquida en su declaración. Le pedimos el NIF en la página de pago.',
  summaryForwardFromLabel: 'El número de su clínica',
  summaryForwardFrom:
    'Es desde este número desde donde va a desviar las llamadas, y es por él como Telma sabe que son de su clínica. Confirme que es correcto: si el desvío sale de otra línea, las llamadas llegan sin decir de quién son. Puede volver atrás y corregirlo ahora.',
  summaryTotal: 'Total',
  summaryTotalNow: 'Total a pagar hoy',
  summaryTrialNote: (d: number) =>
    `Hoy no se cobra nada. El primer cargo es dentro de ${d} días, después de la semana de implementación. La tarjeta queda guardada para entonces.`,
  summaryRenews: (cycle) => `La suscripción se renueva ${cycle === 'annual' ? 'anualmente' : 'mensualmente'}.`,
  summaryCancel: 'Sin permanencia. Puede cancelar cuando quiera desde el panel.',
  summaryByArrangement: 'Este plan requiere un presupuesto personalizado. Nos pondremos en contacto con usted después del alta.',
  summaryFailed: 'No se ha podido calcular el importe en este momento. Puede continuar: verá el importe exacto en Stripe antes de confirmar el pago.',
  summaryLoading: 'Calculando...',
  summaryBack: 'Corregir algo',

  pageTitle: 'Alta',
  metaTitle: 'Alta · Telma',
  metaDescription: 'Dé de alta su clínica en Telma en pocos pasos.',
  intro: 'Telma contesta su teléfono',
  introLead:
    'En pocos pasos, indique los datos esenciales de su clínica. Después podrá configurar en el panel los horarios, los servicios y cómo atiende Telma.',
  savedNotice: 'Sus respuestas quedan guardadas. Puede cerrar y volver más tarde.',
  startOver: 'Empezar de nuevo',
  startOverConfirm: 'Esto borra las respuestas que ya ha guardado y vuelve al primer paso. ¿Quiere continuar?',
  languageLabel: 'Idioma',

  next: 'Continuar',
  back: 'Volver',
  submit: 'Confirmar el alta',
  submitting: 'Creando su clínica...',
  stepOf: 'Paso {n} de {total}',

  errorGeneric: 'No se ha podido guardar. Inténtelo de nuevo.',
  errorFix: 'Revise los campos señalados.',
  errorSubmit:
    'No se ha podido completar el alta. No se ha cobrado nada. Inténtelo de nuevo o hable con nosotros.',
  errorEmailTaken:
    'Ya existe una clínica con este email. Acceda a su cuenta o utilice otro email.',
  errorEmailStaff:
    'Este email ya está asociado a otra cuenta de Telma. Utilice un email distinto para la clínica.',
  errorPhoneTaken:
    'Este número ya está asociado a una clínica en Telma. Si es la suya, acceda al panel. Si cree que es un error, hable con nosotros.',

  clinicName: 'Nombre de la clínica',
  clinicNameHelp: 'Es el nombre que Telma utiliza al contestar.',
  email: 'Email de acceso',
  emailHelp: 'A este email enviaremos los accesos y las comunicaciones sobre la cuenta.',
  emailPlaceholder: 'recepcion@clinicaserrano.es',
  contactEmail: 'Email de recepción',
  contactEmailHelp: 'Adonde enviamos los accesos.',
  phone: 'Teléfono de contacto',
  phoneHelp: 'El número de contacto de la clínica. Lo utilizaremos si necesitamos hablar con usted sobre la configuración o el servicio.',
  specialty: 'Área de la clínica',
  country: 'País',
  region: 'Provincia',
  choose: 'Elija una opción',

  weekdays: 'De lunes a viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
  closed: 'Cerrado',
  opens: 'Abre',
  closes: 'Cierra',
  pause: 'Pausa para comer',
  pauseHelp: 'Telma no da citas a estas horas. Se aplica a todos los días que la clínica abre.',
  pauseStart: 'Inicio',
  pauseEnd: 'Fin',
  duration: 'Cuánto dura una cita',
  durationHelp:
    'El tiempo que Telma reserva en la agenda para cada persona. Con 30 minutos, una cita de las 9:00 ocupa hasta las 9:30.',
  interval: 'A qué horas puede empezar una cita',
  intervalHelp:
    'Cada cuánto se abre un hueco. Con 30 minutos, Telma ofrece las 9:00, las 9:30, las 10:00. Normalmente es igual que la duración de arriba.',
  minutes: 'minutos',

  servicesHelp: 'Puede elegir varios.',
  customServices: 'Otros servicios',
  customServicesHelp: 'Uno por línea. Opcional.',
  durationsToggle: 'Duración y precio de cada servicio',
  durationsHelp:
    'Todo opcional. La duración es el tiempo que Telma deja libre en la agenda, para no meter una sesión de una hora en un hueco de veinte minutos. El precio solo lo dice si lo escribe aquí. Puede cambiarlo cuando quiera desde su panel.',
  durationsUnit: 'min',
  durationsDefault: (m) => `${m} min`,
  detailsService: 'Servicio',
  detailsDuration: 'Duración',
  detailsPrice: 'Precio',
  detailsNotes: 'Algo sobre precios que no quepa en un número',

  address: 'Dirección',
  addressHelp: 'La dirección que Telma puede indicar a quien llama.',
  priceInfo: 'Precios',
  priceInfoHelp: 'Opcional, y solo para lo que no cabe en un número: "el láser varía según la zona", "el primer presupuesto es gratis". Los precios de cada servicio se ponen arriba.',
  priceInfoPlaceholder: 'Primera visita 40 €. Limpieza desde 60 €.',
  groupDoes: 'Dar citas',
  groupDoesLead: 'Lo que hace Telma cuando alguien llama pidiendo hora.',
  booksYes: 'Atiende y da citas',
  booksYesHelp: 'Ve la agenda, ofrece las horas libres y deja la cita en el panel. Es para esto que sirve.',
  booksNo: 'Atiende y toma recados',
  booksNoHelp: 'Nunca ofrece horas ni cita a nadie. Pregunta el motivo de la llamada, toma nota y dice que la clínica le devuelve la llamada. Puede activar las citas cuando quiera, y la agenda vuelve al menú.',
  groupVoice: 'Cómo habla',
  groupVoiceLead: 'En qué lengua abre la llamada y cómo trata a quien llama.',
  groupStuck: 'Cuando no puede ayudar',
  groupStuckLead: 'Va a pasar. Lo que decide aquí es qué hace en ese momento.',
  groupUrgent: 'Urgencias y fuera de horario',
  groupUrgentLead: 'Las dos situaciones en las que una cita no sirve de nada.',
  groupExtra: 'Lo demás',
  groupExtraLead: 'Lo que ninguna pregunta de arriba ha previsto.',
  greetingLanguage: 'Idioma con el que descuelga',
  greetingLanguageHelp:
    'Lo primero que se oye, antes de que quien llama diga nada. Si la clínica atiende en más idiomas, el saludo dice cómo pedirlos, y a partir de ahí Telma no cambia de idioma en toda la llamada.',
  formality: 'Cómo trata a los pacientes',
  formalityHelp: 'Lo primero que se nota por teléfono.',
  formalityFormal: 'De usted',
  formalityInformal: 'De tú',
  fallback: 'Cuando Telma no puede ayudar',
  fallbackHelp: 'Va a pasar. Lo que decide aquí es qué hace en ese momento.',
  fallbackTransfer: 'Pasa la llamada a una persona',
  fallbackTransferHelp: 'Avisa antes de pasarla. Necesita un número que conteste.',
  fallbackMessage: 'Toma nota y la clínica le devuelve la llamada',
  fallbackMessageHelp: 'Pide el nombre, el teléfono y el motivo, y confirma el número repitiéndolo. Dice que la clínica le devuelve la llamada, sin prometer hora concreta. Queda todo registrado en el panel.',
  fallbackNumber: 'Número al que pasar',
  briefing: 'Algo más que Telma deba saber',
  briefingHelp: 'Opcional, y es donde cabe lo que ningún campo de arriba previó. Va tal cual a Telma.',
  briefingPlaceholder: 'Aparcamiento en la calle de atrás.\nAceptamos Sanitas y Adeslas.\nLa Dra. Sofía no pasa consulta los jueves.',
  emergency: 'Urgencias',
  emergencyHelp: 'Quien llama con dolor fuerte, una hemorragia o una hinchazón no quiere hora para el jueves. Telma pasa la llamada de inmediato y nunca ofrece cita en esos casos, aunque la clínica esté sin minutos.',
  emergencyNumber: 'Número de urgencias',
  emergencyNumberHelp: 'Adonde pasa Telma la llamada. Fuera de horario, es el número que da para llamar en ese momento.',
  emergencyProtocol: 'Qué hacer en una urgencia',
  emergencyProtocolHelp: 'Opcional. Sus indicaciones, sobre todo para fuera de horario.',
  emergencyProtocolPlaceholder: 'Fuera de horario, derivar a urgencias del Hospital X.',
  emergencyNone: 'Si deja el número en blanco, fuera de horario Telma dice que la clínica está cerrada y deriva a un servicio de urgencias. Nunca se inventa un número.',
  afterHours: 'Llamadas fuera de horario',
  afterHoursHelp: 'Qué hace Telma cuando alguien llama con la clínica cerrada. Por defecto no molesta a nadie.',
  afterHoursOff: 'Fuera de horario no se molesta a nadie. Telma da el número de urgencias de arriba y explica cuándo vuelve a abrir la clínica.',
  afterHoursOn: 'Acepto que me pasen llamadas fuera del horario',
  afterHoursNumber: 'Número para fuera de horario',
  afterHoursNumberHelp: 'Adónde va la llamada de madrugada. En blanco, se usa el número de urgencias de arriba.',
  afterHoursPatientsOnly: 'Solo a quien ya es paciente',
  afterHoursPatientsOnlyHelp: 'Telma comprueba que quien llama ya ha tenido cita aquí antes de pasar nada. Recomendado: sin esto, cualquiera puede hacer sonar este número a las tres de la mañana.',
  afterHoursNumberRequired: 'Indique adónde va la llamada, aquí o en el número de urgencias.',
  languages: 'En qué idiomas atiende Telma',
  languagesHelp: 'Telma reconoce la lengua de quien llama y responde en ella. Su plan incluye un número de idiomas; elija cuáles.',
  languagesCount: '{n} de {max} elegidos',
  languagesSoon: 'próximamente',
  languagesFull: 'Ha llegado al máximo de esta selección. Quite uno para elegir otro, o suba de plan en el último paso.',
  errorTooManyLanguages: 'Ha elegido más idiomas de los que incluye este plan.',
  planLanguage: 'idioma',
  planLanguages: 'idiomas',
  planTooFewLanguages: 'Este plan incluye menos idiomas de los que ha elegido.',
  planDescriptions: {
    essencial: 'Para clínicas pequeñas',
    clinica: 'El más elegido. Voz personalizada e informe mensual incluidos.',
    rede: 'Para grupos con varias clínicas. Panel unificado y un número propio por sede.',
  },

  keepNumber: 'Quiero conservar mi número',
  keepNumberHelp:
    'Mantiene el número que sus pacientes ya conocen. Cuando la línea de Telma esté lista, le ayudaremos a configurar el desvío de llamadas.',
  keepOnlyHelp:
    'Conserva el número que sus pacientes ya conocen: es ese el que pasa las llamadas a Telma, y no cambia nada para quien llama. Al final le enseñamos a configurar el desvío. Si de verdad necesita un número nuevo, hable con nosotros antes de seguir.',
  newNumber: 'Quiero un número nuevo de Telma',
  newNumberHelp: 'Solicitamos un número de la zona que elija. Le avisaremos por email en cuanto esté activo.',
  currentNumber: 'Número de la clínica',
  currentNumberHelp: 'El número habitual de su clínica, al que llaman los pacientes.',
  operator: 'Operadora actual',
  operatorOther: 'Otra',
  forwardTitle: 'Qué llamadas pasan a Telma',
  forwardNoAnswer: 'Solo las llamadas no atendidas',
  forwardNoAnswerHelp:
    'El teléfono de la clínica suena primero. Si está ocupado o nadie contesta, atiende Telma.',
  forwardAll: 'Todas las llamadas',
  forwardAllHelp:
    'Las llamadas van directamente a Telma, sin sonar primero en la clínica. Esta opción utiliza más minutos del plan.',
  areaRegion: 'Zona del nuevo número',
  portingNote:
    'Su número actual sigue en la misma operadora. Telma tendrá un número propio para recibir las llamadas desviadas. Cuando la línea esté lista, le explicaremos en el panel cómo configurar el desvío.',

  planMonthly: 'Mensual',
  planAnnual: 'Anual',
  planAnnualHint: 'Dos meses de regalo',
  perMonth: '/mes',
  perYear: '/año',
  includedMinutes: 'minutos de llamadas al mes',
  locations: 'sedes incluidas',
  addonWhatsapp: 'Añadir Telma a WhatsApp',
  addonWhatsappHelp: 'Telma también responde por WhatsApp y puede dar citas. 49 €/mes.',
  addonWhatsappSoon: 'Próximamente',
  needMore: '¿Varias sedes o más de 1750 minutos?',
  needMoreLink: 'Hable con nosotros',
  terms: 'He leído y acepto los términos del servicio y la política de privacidad.',
  paymentNote:
    'El pago se realiza en la página segura de Stripe. Los datos de la tarjeta no pasan por Telma.',
  paymentNoteDemo:
    'Modo de demostración: no se pide ninguna tarjeta y no se cobra nada. La clínica se crea igualmente.',

  doneEyebrow: 'Alta completada',
  doneTitle: 'Su clínica está creada',
  doneLead: 'Hemos enviado los accesos a {email}. Guarde esta página hasta que acceda al panel por primera vez.',
  doneDemo:
    'Modo de demostración: el número es ficticio y no se ha cobrado nada. Nada de esto llega a un cliente real.',
  doneNumber: 'El número que contesta Telma',
  donePorting: 'El número de Telma, al que desviará el suyo',
  donePendingTitle: 'El número',
  donePendingBody:
    'Estamos tramitando la activación del número con la operadora. Le avisaremos por email en cuanto esté activo. Mientras tanto, ya puede configurar Telma en el panel.',
  donePortingNote: 'El número habitual de la clínica no cambia. Cuando la línea de Telma esté lista, le explicaremos en el panel cómo desviar las llamadas que quiera que atienda.',
  doneCredentials: 'Sus accesos',
  donePassword: 'Contraseña temporal',
  donePasswordHelp: 'Esta contraseña solo se muestra una vez. Cámbiela después de acceder.',
  doneOpenPanel: 'Abrir el panel',
  donePreviewHelp: 'Podrá cambiar estos datos después desde el panel.',
  doneNextTitle: 'Qué pasa a continuación',
  doneNext: [
    'Configure la clínica en el panel: los horarios, los servicios y cómo atiende Telma.',
    'Cuando la línea esté lista, active Telma y haga una llamada de prueba.',
  ],
  doneNextKeep: 'Configure el desvío de llamadas desde el número habitual de la clínica. En el panel le explicamos cómo hacerlo.',
  doneNextNew: 'Empiece a utilizar el número nuevo: en su web, en Google y en el resto de canales de la clínica.',
  doneNextEither: 'Si ha conservado el número de la clínica, configure el desvío de llamadas. Si ha elegido un número nuevo, empiece a darlo a conocer.',
  copy: 'Copiar',
  copied: 'Copiado',

  haveAccount: 'Ya tengo cuenta',
  legalTerms: 'Términos',
  legalPrivacy: 'Privacidad',
  byBweb: 'Telma, de Bweb Studio',

  thanksTitle: 'Pago recibido',
  thanksLead:
    'Gracias. Su clínica está creada. Le hemos enviado por email los accesos al panel y la contraseña temporal.',
  thanksNoEmail: '¿No ha recibido el email? Escriba a',
  thanksReference: 'Referencia del pago:',
}

export const COPY: Record<OnboardingLocale, Copy> = { pt, es }

export function copyFor(locale: OnboardingLocale): Copy {
  return COPY[locale] ?? COPY.pt
}

/** `Passo 2 de 6`. A function so the sentence lives in the copy and not in a
 *  component that would have to know where the numbers go in each language. */
export function stepOf(locale: OnboardingLocale, n: number, total: number): string {
  return copyFor(locale).stepOf.replace('{n}', String(n)).replace('{total}', String(total))
}
