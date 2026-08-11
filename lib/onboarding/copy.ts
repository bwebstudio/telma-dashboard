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

  pageTitle: string
  intro: string
  introLead: string
  savedNotice: string
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
  errorEmailStaff: string

  clinicName: string
  clinicNameHelp: string
  email: string
  emailHelp: string
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
  detailsNoPrice: string

  address: string
  addressHelp: string
  priceInfo: string
  priceInfoHelp: string
  priceInfoPlaceholder: string
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
  fallbackCallback: string
  fallbackCallbackHelp: string
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
  planLanguages: string
  planTooFewLanguages: string

  keepNumber: string
  keepNumberHelp: string
  newNumber: string
  newNumberHelp: string
  currentNumber: string
  operator: string
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
  donePortingNote: string
  doneCredentials: string
  donePassword: string
  donePasswordHelp: string
  doneOpenPanel: string
  doneNextTitle: string
  doneNext: string[]
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
    { n: 2, short: 'Clínica', title: 'A sua clínica', help: 'O essencial, e a morada, que é a pergunta que mais fazem ao telefone.' },
    { n: 3, short: 'Horários', title: 'Quando está aberta', help: 'A Telma só oferece horas dentro deste horário. Pode ajustar tudo depois, no painel.' },
    { n: 4, short: 'Serviços', title: 'O que a Telma pode marcar', help: 'Escolha só o que a clínica faz. A Telma nunca marca nada fora desta lista.' },
    { n: 5, short: 'A Telma', title: 'Formar a sua rececionista', help: 'A parte que faz a diferença: como fala, em que idiomas, e o que faz quando não sabe.' },
    { n: 6, short: 'Número', title: 'O número e o arranque', help: 'Pode manter o número que já divulgou, ou receber um novo da sua região.' },
  ],

  pageTitle: 'Inscrição',
  intro: 'A Telma atende o seu telefone',
  introLead:
    'Seis perguntas e a sua clínica passa a ter quem atenda todas as chamadas, marque consultas na agenda e responda ao que os pacientes perguntam sempre.',
  savedNotice: 'As suas respostas ficam guardadas. Pode fechar e voltar mais tarde.',
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
    'Já existe uma clínica com este email. Entre em vez de se inscrever, ou use outro email.',
  errorEmailStaff:
    'Este email já está a ser usado por outra conta da Telma. Use um endereço diferente para a clínica.',

  clinicName: 'Nome da clínica',
  clinicNameHelp: 'Como a Telma se apresenta ao telefone.',
  email: 'Email da receção',
  emailHelp: 'Para onde enviamos os acessos e o resumo do dia.',
  phone: 'Telefone de contacto',
  phoneHelp: 'O número atual da clínica, para falarmos consigo.',
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
  pauseHelp: 'Aplicada a todos os dias abertos. A Telma não marca nada neste intervalo.',
  pauseStart: 'Início',
  pauseEnd: 'Fim',
  duration: 'Duração da consulta',
  durationHelp: 'Quanto tempo o paciente ocupa a cadeira.',
  interval: 'Intervalo entre consultas',
  intervalHelp: 'De quanto em quanto tempo pode começar uma consulta nova.',
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
  detailsNoPrice: 'sem preço',

  address: 'Morada',
  addressHelp: 'A pergunta que mais fazem ao telefone. A Telma dá-a tal como a escrever aqui.',
  priceInfo: 'Preços',
  priceInfoHelp: 'Opcional, e só para o que não cabe num número: "o laser varia com a zona", "o primeiro orçamento é gratuito". Os preços de cada serviço põem-se em cima.',
  priceInfoPlaceholder: 'Primeira consulta 40 €. Limpeza a partir de 60 €.',
  greetingLanguage: 'Idioma com que atende',
  greetingLanguageHelp: 'O primeiro que se ouve, antes de quem liga dizer nada. Depois a Telma acompanha a língua da pessoa.',
  formality: 'Como trata os pacientes',
  formalityHelp: 'A primeira coisa que se nota ao telefone.',
  formalityFormal: 'Por "o senhor" / "a senhora"',
  formalityInformal: 'Por "tu"',
  fallback: 'Quando a Telma não consegue ajudar',
  fallbackHelp: 'Vai acontecer. O que decide aqui é o que ela faz nesse momento.',
  fallbackTransfer: 'Passa a chamada a uma pessoa',
  fallbackTransferHelp: 'Avisa antes de passar. Precisa de um número que atenda.',
  fallbackMessage: 'Toma nota do recado',
  fallbackMessageHelp: 'Pede nome, número e mensagem, e confirma o número repetindo-o.',
  fallbackCallback: 'Diz que a clínica liga de volta',
  fallbackCallbackHelp: 'Sem prometer hora certa. Fica registado no painel.',
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
  planLanguages: 'idiomas',
  planTooFewLanguages: 'Inclui menos idiomas do que os que escolheu',

  keepNumber: 'Quero manter o meu número',
  keepNumberHelp:
    'Fica com o número que já está nos cartões e no Google. Tratamos do encaminhamento com a sua operadora, sem interromper o serviço.',
  newNumber: 'Quero um número novo da Telma',
  newNumberHelp: 'Um número da sua região, ativo no mesmo dia.',
  currentNumber: 'Número atual',
  operator: 'Operadora atual',
  areaRegion: 'Região do novo número',
  portingNote:
    'A portabilidade demora entre 5 e 10 dias úteis. Até lá, damos-lhe um número temporário para poder começar.',

  planMonthly: 'Mensal',
  planAnnual: 'Anual',
  planAnnualHint: 'Dois meses oferecidos',
  perMonth: '/mês',
  perYear: '/ano',
  includedMinutes: 'minutos de conversa por mês',
  locations: 'sedes incluídas',
  addonWhatsapp: 'Adicionar a Telma no WhatsApp',
  addonWhatsappHelp: 'Confirmações e lembretes automáticos. 49 €/mês.',
  needMore: 'Mais de 5 sedes ou mais de 2000 minutos?',
  needMoreLink: 'Fale connosco',
  terms: 'Li e aceito os termos de serviço e a política de privacidade.',
  paymentNote:
    'O pagamento é feito na página segura da Stripe. Os dados do cartão nunca passam por nós.',
  paymentNoteDemo:
    'Modo de demonstração: nenhum cartão é pedido e nada é cobrado. A clínica é criada na mesma.',

  doneEyebrow: 'Inscrição concluída',
  doneTitle: 'A sua clínica está criada',
  doneLead: 'Enviámos os acessos para {email}. Guarde esta página até entrar pela primeira vez.',
  doneDemo:
    'Modo de demonstração: o número é fictício e não foi cobrado nada. Nada disto chega a um cliente real.',
  doneNumber: 'O número que a Telma atende',
  donePorting: 'Número temporário enquanto a portabilidade decorre',
  donePortingNote: 'Avisamos assim que a portabilidade do seu número estiver concluída.',
  doneCredentials: 'Os seus acessos',
  donePassword: 'Palavra-passe temporária',
  donePasswordHelp: 'Mostrada uma única vez. Mude-a assim que entrar.',
  doneOpenPanel: 'Abrir o painel',
  doneNextTitle: 'O que acontece a seguir',
  doneNext: [
    'Confirmamos a configuração e ligamos a voz ao seu número.',
    'Fazemos uma chamada de teste consigo, para ouvir como soa.',
    'A partir daí, a Telma atende. Vê tudo no painel, em direto.',
  ],
  copy: 'Copiar',
  copied: 'Copiado',

  haveAccount: 'Já tenho conta',
  legalTerms: 'Termos',
  legalPrivacy: 'Privacidade',
  byBweb: 'Telma, por Bweb Studio',

  thanksTitle: 'Pagamento recebido',
  thanksLead:
    'Obrigado. A sua clínica está criada e os acessos ao painel seguiram por email, com a palavra-passe temporária.',
  thanksNoEmail: 'Não recebeu o email? Escreva para',
  thanksReference: 'Referência do pagamento:',
}

const es: Copy = {
  steps: [
    { n: 1, short: 'Plan', title: 'El plan', help: 'Sin permanencia. Puede cambiar de plan o cancelar cuando quiera.' },
    { n: 2, short: 'Clínica', title: 'Su clínica', help: 'Lo esencial, y la dirección, que es la pregunta que más hacen por teléfono.' },
    { n: 3, short: 'Horarios', title: 'Cuándo está abierta', help: 'Telma solo ofrece horas dentro de este horario. Puede ajustarlo todo después, en el panel.' },
    { n: 4, short: 'Servicios', title: 'Qué puede citar Telma', help: 'Elija solo lo que hace la clínica. Telma nunca cita nada fuera de esta lista.' },
    { n: 5, short: 'Telma', title: 'Formar a su recepcionista', help: 'La parte que marca la diferencia: cómo habla, en qué idiomas, y qué hace cuando no sabe.' },
    { n: 6, short: 'Número', title: 'El número y el arranque', help: 'Puede conservar el número que ya ha publicado, o recibir uno nuevo de su zona.' },
  ],

  pageTitle: 'Alta',
  intro: 'Telma contesta su teléfono',
  introLead:
    'Seis preguntas y su clínica pasa a tener quien conteste todas las llamadas, dé cita en la agenda y responda lo que los pacientes preguntan siempre.',
  savedNotice: 'Sus respuestas quedan guardadas. Puede cerrar y volver más tarde.',
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
    'Ya existe una clínica con este email. Entre en lugar de darse de alta, o use otro email.',
  errorEmailStaff:
    'Este email ya lo usa otra cuenta de Telma. Use una dirección distinta para la clínica.',

  clinicName: 'Nombre de la clínica',
  clinicNameHelp: 'Cómo se presenta Telma al teléfono.',
  email: 'Email de recepción',
  emailHelp: 'Adonde enviamos los accesos y el resumen del día.',
  phone: 'Teléfono de contacto',
  phoneHelp: 'El número actual de la clínica, para poder hablar con usted.',
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
  pauseHelp: 'Se aplica a todos los días abiertos. Telma no cita nada en este intervalo.',
  pauseStart: 'Inicio',
  pauseEnd: 'Fin',
  duration: 'Duración de la cita',
  durationHelp: 'Cuánto tiempo ocupa el paciente el sillón.',
  interval: 'Intervalo entre citas',
  intervalHelp: 'Cada cuánto tiempo puede empezar una cita nueva.',
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
  detailsNoPrice: 'sin precio',

  address: 'Dirección',
  addressHelp: 'La pregunta que más hacen por teléfono. Telma la da tal como la escriba aquí.',
  priceInfo: 'Precios',
  priceInfoHelp: 'Opcional, y solo para lo que no cabe en un número: "el láser varía según la zona", "el primer presupuesto es gratis". Los precios de cada servicio se ponen arriba.',
  priceInfoPlaceholder: 'Primera visita 40 €. Limpieza desde 60 €.',
  greetingLanguage: 'Idioma con el que descuelga',
  greetingLanguageHelp: 'Lo primero que se oye, antes de que quien llama diga nada. Después Telma sigue la lengua de la persona.',
  formality: 'Cómo trata a los pacientes',
  formalityHelp: 'Lo primero que se nota por teléfono.',
  formalityFormal: 'De usted',
  formalityInformal: 'De tú',
  fallback: 'Cuando Telma no puede ayudar',
  fallbackHelp: 'Va a pasar. Lo que decide aquí es qué hace en ese momento.',
  fallbackTransfer: 'Pasa la llamada a una persona',
  fallbackTransferHelp: 'Avisa antes de pasarla. Necesita un número que conteste.',
  fallbackMessage: 'Toma nota del recado',
  fallbackMessageHelp: 'Pide nombre, teléfono y mensaje, y confirma el número repitiéndolo.',
  fallbackCallback: 'Dice que la clínica le devuelve la llamada',
  fallbackCallbackHelp: 'Sin prometer hora concreta. Queda registrado en el panel.',
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
  planLanguages: 'idiomas',
  planTooFewLanguages: 'Incluye menos idiomas de los que ha elegido',

  keepNumber: 'Quiero conservar mi número',
  keepNumberHelp:
    'Se queda con el número que ya está en las tarjetas y en Google. Nos encargamos del desvío con su operadora, sin cortar el servicio.',
  newNumber: 'Quiero un número nuevo de Telma',
  newNumberHelp: 'Un número de su zona, activo el mismo día.',
  currentNumber: 'Número actual',
  operator: 'Operadora actual',
  areaRegion: 'Zona del número nuevo',
  portingNote:
    'La portabilidad tarda entre 5 y 10 días laborables. Hasta entonces le damos un número temporal para poder empezar.',

  planMonthly: 'Mensual',
  planAnnual: 'Anual',
  planAnnualHint: 'Dos meses de regalo',
  perMonth: '/mes',
  perYear: '/año',
  includedMinutes: 'minutos de conversación al mes',
  locations: 'sedes incluidas',
  addonWhatsapp: 'Añadir Telma en WhatsApp',
  addonWhatsappHelp: 'Confirmaciones y recordatorios automáticos. 49 €/mes.',
  needMore: '¿Más de 5 sedes o más de 2000 minutos?',
  needMoreLink: 'Hable con nosotros',
  terms: 'He leído y acepto los términos del servicio y la política de privacidad.',
  paymentNote:
    'El pago se hace en la página segura de Stripe. Los datos de la tarjeta no pasan nunca por nosotros.',
  paymentNoteDemo:
    'Modo de demostración: no se pide ninguna tarjeta y no se cobra nada. La clínica se crea igualmente.',

  doneEyebrow: 'Alta completada',
  doneTitle: 'Su clínica está creada',
  doneLead: 'Hemos enviado los accesos a {email}. Guarde esta página hasta que entre por primera vez.',
  doneDemo:
    'Modo de demostración: el número es ficticio y no se ha cobrado nada. Nada de esto llega a un cliente real.',
  doneNumber: 'El número que contesta Telma',
  donePorting: 'Número temporal mientras se hace la portabilidad',
  donePortingNote: 'Le avisamos en cuanto la portabilidad de su número esté terminada.',
  doneCredentials: 'Sus accesos',
  donePassword: 'Contraseña temporal',
  donePasswordHelp: 'Se muestra una sola vez. Cámbiela en cuanto entre.',
  doneOpenPanel: 'Abrir el panel',
  doneNextTitle: 'Qué pasa a continuación',
  doneNext: [
    'Confirmamos la configuración y conectamos la voz a su número.',
    'Hacemos una llamada de prueba con usted, para oír cómo suena.',
    'A partir de ahí, Telma contesta. Lo ve todo en el panel, en directo.',
  ],
  copy: 'Copiar',
  copied: 'Copiado',

  haveAccount: 'Ya tengo cuenta',
  legalTerms: 'Términos',
  legalPrivacy: 'Privacidad',
  byBweb: 'Telma, de Bweb Studio',

  thanksTitle: 'Pago recibido',
  thanksLead:
    'Gracias. Su clínica está creada y los accesos al panel han salido por email, con la contraseña temporal.',
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
