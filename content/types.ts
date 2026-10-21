import type {
  CrmActivityType,
  CrmContactRole,
  CrmCountry,
  CrmOrigin,
  CrmResult,
  CrmSpecialty,
  CrmStage,
} from '@/lib/crm/types'

// Typed dictionary shared by every language, mirroring the landing approach.
// To add a language: create content/<lang>.ts implementing Dictionary and
// register it in content/index.ts. TypeScript then tells you exactly which
// keys are missing, so no component ever needs touching.
//
// This covers interface text only. Anything a rep types (clinic names, contact
// names, call notes) is stored and shown verbatim, never translated.

export interface Dictionary {
  /**
   * What the browser shows: the tab, the bookmark, the installed app's name.
   * It was written once in Portuguese for everybody, so a clinic working in
   * Spanish had a Portuguese tab open all day.
   */
  meta: {
    title: string
    description: string
  }
  common: {
    appName: string
    loading: string
    errorTitle: string
    errorGeneric: string
    retry: string
    save: string
    saving: string
    saved: string
    cancel: string
    back: string
    search: string
    all: string
    none: string
    /** A call that arrived without a caller id. "None" read as a phone number. */
    noNumber: string
    today: string
    signOut: string
    language: string
    /** Read out by the language button. Carries {lang}, the target language. */
    switchLanguage: string
    copy: string
    copied: string
    patient: string
    phone: string
    email: string
    name: string
    reason: string
    /** Label for how a booking arrived: by phone or by WhatsApp. */
    channel: string
    date: string
    time: string
    status: string
    actions: string
    summary: string
    of: string
    thisMonth: string
    optional: string
  }
  status: {
    appointment: Record<
      'pendente' | 'confirmada' | 'rejeitada' | 'copiada' | 'cancelada' | 'expirada',
      string
    >
    clinic: Record<'ativa' | 'por_configurar' | 'pausada' | 'cancelada', string>
    call: Record<
      'marcacao' | 'transferida' | 'informacao' | 'nao_resolvida' | 'nao_atendida',
      string
    >
    origin: Record<'telefone' | 'whatsapp', string>
    channel: Record<'telefone' | 'whatsapp', string>
  }
  plans: Record<'essencial' | 'clinica' | 'rede' | 'personalizado', string>
  weekdays: string[] // 7 entries, index 0 = Sunday .. 6 = Saturday
  auth: {
    title: string
    subtitle: string
    email: string
    password: string
    signIn: string
    signingIn: string
    invalid: string
    forgot: string
    /** For somebody who followed the sign-in link without having bought yet. */
    noAccount: string
    signUp: string
    /** The two lines on the dark half of the sign-in screen. */
    panelLine: string
    panelSub: string
    /** The screen that asks for an email. */
    resetTitle: string
    resetLead: string
    resetSend: string
    resetSending: string
    /** Said whether or not the address exists: telling a stranger which emails
     *  are registered is telling them which clinics are clients. */
    resetSent: string
    resetBack: string
    /** The screen the link lands on. */
    newTitle: string
    newLead: string
    newPassword: string
    newRepeat: string
    newSave: string
    newSaving: string
    newTooShort: string
    newMismatch: string
    newExpired: string
  }
  // The three panels and the administrator's visit to a client's one.
  panels: {
    clinica: string
    interno: string
    crm: string
    switch: string
    openClinicPanel: string
    viewingAs: string
    readOnly: string
    exitView: string
  }
  clinicNav: {
    /** The first entry, for a clinic whose Telma does not book. */
    dia: string
    hoje: string
    marcacoes: string
    pacientes: string
    horarios: string
    chamadas: string
    conta: string
    /** What Telma says, which is the clinic's to change and not ours. */
    telma: string
    /** Only shown where the simulator exists, which is never in production. */
    /** Sidebar group headings: today's work, and what is set once. */
    groupDay: string
    groupSetup: string
    testCall: string
  }
  telmaSettings: {
    title: string
    lead: string
    /**
     * The rules that are ours, shown and not editable.
     *
     * An owner being sold this asks "and what if she makes something up?", and
     * until now the answer lived only in the prompt, where nobody could see it.
     * A screen full of fields says the clinic is in control; this says the
     * control has a floor under it, which is the half that makes the other
     * half safe to sell.
     */
    guaranteesTitle: string
    guaranteesLead: string
    guarantees: string[]
  }
  // The clinic's home screen: the day, and what needs an answer before it.
  /** The forwarding card: what a clinic that kept its own number has to do so
   *  calls reach us. The digits live in lib/forwarding.ts; these are only the
   *  words. `{own}` is the clinic's public number, `{telma}` the hidden one we
   *  bought, `{code}` the cancel-everything code. */
  subscription: {
    title: string
    lead: string
    pauseTitle: string
    pauseHelp: string
    pauseOne: string
    pauseMany: string
    pausedUntil: string
    resume: string
    cancelTitle: string
    cancelHelp: string
    cancelHelpNoDate: string
    reasonLabel: string
    reasonOptional: string
    reasonPlaceholder: string
    reasonHelp: string
    cancelAction: string
    cancelConfirmTitle: string
    cancelConfirmBody: string
    cancelConfirmBodyNoDate: string
    cancelConfirmGo: string
    cancelled: string
    cancelledNoDate: string
    keep: string
    forwardTitle: string
    forwardAfterCancel: string
    forwardAfterCancelNoDate: string
    forwardAfterPause: string
    eraseTitle: string
    eraseHelp: string
    eraseRetention: string
    eraseGrace: string
    eraseAction: string
    eraseConfirmTitle: string
    eraseConfirmBody: string
    eraseConfirmGo: string
    erasePending: string
    eraseKeep: string
    back: string
    failed: string
  }
  forwarding: {
    eyebrow: string
    titleKeep: string
    titleAll: string
    leadKeep: string
    leadAll: string
    stepsIntroMany: string
    stepsIntroOne: string
    codes: Record<'all' | 'noAnswer' | 'busy' | 'unreachable', string>
    doneTitle: string
    doneBodyKeep: string
    doneBodyAll: string
    copy: string
    copied: string
    mustMatch: string
    undoTitle: string
    undoBody: string
    fixedTitle: string
    fixedBody: string
    markDone: string
    savingDone: string
    failed: string
  }
  /** The guided first run: one question per screen, saved as it goes, ending
   *  on the clinic reading its own answers back before turning Telma on. */
  setupWizard: {
    steps: { hours: string; services: string; languages: string; telma: string; review: string }
    stepOf: string
    doneLabel: string
    titles: { hours: string; services: string; languages: string; telma: string; review: string }
    leads: { hours: string; services: string; languages: string; telma: string; review: string }
    reviewHelp: string
    back: string
    continue: string
    saving: string
    activate: string
    activating: string
    activateFailed: string
    /** The one refusal that is not the clinic's fault and is not worth
     *  retrying: the number is not live yet. */
    activateNoNumber: string
    hoursAlready: string
    saveFailed: string
    missingElsewhere: string
    tooManyLanguages: string
  }
  /** The first minute in the panel: a welcome card, then a walk round the
   *  sidebar. `{clinic}` is the clinic's name, `{n}`/`{total}` the position. */
  welcome: {
    eyebrow: string
    title: string
    lead: string
    start: string
    skip: string
    close: string
    next: string
    done: string
    step: string
    /** The last stop is not a place in the sidebar. The password everybody
     *  starts with was emailed to them, and the only moment they are certain
     *  to be looking is the first minute in the panel. */
    changePassword: string
    steps: Record<
      // 'dia' is the same first entry seen by a clinic whose Telma does not
      // book: the screen behind it is what she did, not a diary.
      'hoje' | 'dia' | 'marcacoes' | 'pacientes' | 'conversas' | 'horarios' | 'telma' | 'password',
      { title: string; body: string }
    >
  }
  /** The language chooser, shared by the account page and the guided setup.
   *  It was written inline in the page with a ternary per string, which is
   *  how the second place to show it would have got a second wording. */
  languagesSection: {
    title: string
    help: string
    count: string
    base: string
    soon: string
    full: string
    tooMany: string
  }
  /** The door to Stripe's customer portal: invoices, card, cancellation.
   *  Never named to the clinic, which sees our brand on the page. */
  billingPortal: {
    title: string
    help: string
    open: string
    opening: string
    failed: string
  }
  setup: {
    eyebrow: string
    title: string
    lead: string
    /** For a clinic that kept its own number: the one above promises a
     *  number that is theirs to hand out, and this one is not. */
    leadKeep: string
    go: string
    activate: string
    activating: string
    notYet: string
    /** Beside the one step that is not the clinic's to do. The number is
     *  ordered by us and in Portugal it takes days, so the list says so
     *  instead of offering a link to nowhere. */
    waitingNumber: string
    failed: string
    steps: { hours: string; services: string; number: string }
    /** Shown only to a clinic that kept its own number: the forward comes
     *  after activation, and this screen has to say so. */
    thenForward: string
  }
  agenda: {
    title: string
    elsewhereOnePending: string
    elsewherePending: string
    elsewhereOneCancelled: string
    elsewhereCancelled: string
    elsewhereGo: string
    viewDay: string
    greeting: string
    live: string
    liveLost: string
    liveRetry: string
    updated: string
    attention: string
    attentionNone: string
    needsAnswer: string
    /** Said the same way by the day, the week and the month: one fact, one
     *  sentence, so nobody has to learn it twice. Both carry {n}. */
    pendingCount: string
    cancelledCount: string
    justCancelled: string
    cancelledBy: string
    slotFreed: string
    dayBefore: string
    dayToday: string
    dayAfter: string
    pickDay: string
    now: string
    emptyDay: string
    closedDay: string
    doneTitle: string
    /** The day, for a clinic whose Telma does not book: what she did, and the
     *  week under it. See components/clinic/MessagesDay. */
    messagesTitle: string
    messagesLead: string
    messagesEmpty: string
    weekTitle: string
    doneCalls: string
    /** Only drawn when it happened: calls that ended while it rang. */
    doneMissed: string
    doneWhatsapp: string
    doneBookings: string
    doneCancelled: string
    doneInfo: string
    seeConversations: string
    openConversation: string
    seen: string
    seenDone: string
    // How long is left to answer a pre-marcação before it lets its hour go.
    holdConfirmIn: string
    holdCritical: string
    holdExpired: string
    holdAria: string
  }
  // Calls and WhatsApp threads, in one timeline.
  conversas: {
    title: string
    subtitle: string
    subtitleNoWhatsapp: string
    filterChannel: string
    empty: string
    transcript: string
    showTranscript: string
    hideTranscript: string
    noTranscript: string
    speakerTelma: string
    speakerPatient: string
    booked: string
  }
  internoNav: {
    clinicas: string
    consumo: string
    atividade: string
  }
  hoje: {
    title: string
    greeting: string
    live: string
    pendingTitle: string
    pendingEmpty: string
    callsTitle: string
    callsEmpty: string
    seeAll: string
  }
  marcacoes: {
    title: string
    help: string
    empty: string
    confirm: string
    /** Calling off a booking that was already confirmed. There was no way to
     *  do it, so a cancelled slot reached the patient only by somebody
     *  remembering to telephone them. */
    cancelAppt: string
    cancelApptConfirm: string
    alter: string
    reject: string
    copyData: string
    copiedToSystem: string
    copiedToSystemHint: string
    alterWarning: string
    newDateTime: string
    rejectReason: string
    rejectReasonHint: string
    confirmConfirm: string
    visits: string
    olderHint: string
    olderGo: string
    filterAll: string
    /** A filter's own label. It used to borrow the singular status badge. */
    filterCancelled: string
    filterPending: string
    /** The two groups the default view is split into, each with its count, so
     *  the order is visible instead of being something you work out. */
    groupPending: string
    groupAnswered: string
    orderPending: string
    orderAnswered: string
  }
  /**
   * The patient record, and the reminders hanging off it.
   *
   * One screen and not two: a reminder is about a person, so it lives on that
   * person's record, and the only thing the list adds is what is going out this
   * week. Anything else would be the same decision in two places, which is how
   * the calendar words went wrong before.
   */
  pacientes: {
    title: string
    lead: string
    search: string
    searchGo: string
    empty: string
    none: string
    more: string
    optedOut: string
    back: string
    /** Housekeeping, not the right to be forgotten. The screen says which. */
    deleteRecord: string
    deleteWhatGoes: string
    deleteVsErasure: string
    deleteConfirm: string
    /** A record opened by hand, for somebody standing at the desk. */
    addPatient: string
    addName: string
    addPhone: string
    addPhoneHint: string

    notes: string
    /** From a message to a record, on the day's list. See FollowCaller. */
    followCaller: string
    openRecord: string
    callerName: string
    createRecord: string
    activityTitle: string
    activityEmpty: string
    activityNote: string
    activityOpened: string
    activityClosed: string
    activityCall: string
    /** Prefixes a booking's state: "Marcação" + "rejeitada". */
    activityBooking: string
    /** The fold on a long record. Takes {n}. */
    activityMore: string
    activityLess: string
    followQueueTitle: string
    followTitle: string
    followOpen: string
    followClosed: string
    /** One of them, and more than one: "(s)" on a line a clinic reads every
     *  day is a form, not a product. */
    followAttemptsOne: string
    followAttempts: string
    followDone: string
    followOpenAction: string
    followReasonPlaceholder: string
    logAttempt: string
    attemptHint: string
    attemptPlaceholder: string
    attemptReached: string
    attemptMissed: string
    attemptReachedTag: string
    attemptMissedTag: string
    notesHint: string
    noteAdd: string
    notePlaceholder: string
    notesEmpty: string
    noteDelete: string
    noteDeleteConfirm: string
    /** The identifier a receptionist types and Telma never asks for. */
    taxId: string
    taxIdHint: string
    /** Two records that look like one person. */
    maybeSame: string
    maybeSameHint: string
    merge: string
    mergeWarn: string
    history: string
    /** The calls, matched to this person by their number. */
    calls: string
    callsEmpty: string
    callsGone: string
    since: string
    historyEmpty: string
    visits: string
    visitsOne: string

    messages: string
    reminders: string
    remindersHint: string
    marketing: string
    marketingHint: string
    marketingSource: string
    marketingSourcePlaceholder: string
    marketingSourceRequired: string
    marketingSourceMandatory: string

    recalls: string
    recallsEmpty: string
    add: string
    addWhen: string
    addNote: string
    addNoteHint: string
    /** Said where the reminder is scheduled and nowhere else: it is the one
     *  moment the cost is about to be incurred and the one reader it concerns. */
    addCosts: string
    addKind: string
    /** Why no reminder can be scheduled for this person, and where to change
     *  it. The second form is for the ones already waiting, which will not go. */
    addBlocked: string
    addBlockedWaiting: string
    addKindNoConsent: string
    addKindAviso: string
    addKindCampanha: string
    addBody: string
    addBodyHint: string
    /** Said next to the box, because the box can now be edited. */
    addBodyWarn: string
    /** The exact text the person will get, shown before anything is scheduled.
     *  The only honest way to promise a message never names the treatment. */
    preview: string
    previewSegments: string

    stateAgendado: string
    stateEnviado: string
    stateFalhou: string
    stateCancelado: string
    cancelRecall: string
    retryRecall: string
    sentOn: string
    dueOn: string

    queue: string
    queueEmpty: string
    failed: string
    whyBaixa: string
    whySemConsentimento: string
    whySemNumero: string
  }
  /** A patient asking to be forgotten, answered by the clinic itself. */
  erasure: {
    title: string
    help: string
    phoneLabel: string
    look: string
    nothingFound: string
    foundCount: string
    whatSurvives: string
    referenceLabel: string
    referencePlaceholder: string
    erase: string
    doneCount: string
  }
  horarios: {
    title: string
    /** The windows editor that replaced the hour grid. */
    openLabel: string
    closeLabel: string
    addWindow: string
    removeWindow: string
    closedDay: string
    stepLabel: string
    stepHelp: string
    overlaps: string
    /** How full a day is, said in words beside the bar. `{n}` and `{total}`
     *  are filled in by the caller.
     *
     *  A string with holes in it rather than a function, and that is a rule for
     *  this whole file rather than a preference here. The dictionary is handed
     *  whole to client components, and a function cannot cross that boundary:
     *  the page throws "Functions cannot be passed directly to Client
     *  Components" at render time, on the server, with a digest instead of a
     *  message. Every other entry in this file is a string, which is why it had
     *  never happened before. */
    bookedOfTotal: string
    allFree: string
    /** The chip with no service behind it, named so grey is not a fault. */
    noService: string
    /** Diaries. Invisible while the clinic has one, which is most of them. */
    addProfessional: string
    professionalName: string
    professionalHint: string
    everyone: string
    renameProfessional: string
    removeProfessional: string
    lastProfessional: string
    help: string
    /** The weekly grid's own heading. It used to repeat the page title. */
    gridTitle: string
    gridHint: string
    gridReadOnly: string
    capacityNote: string
    blockedTitle: string
    blockedHelp: string
    addBlock: string
    blockDayLabel: string
    blockReason: string
    noBlocked: string
    remove: string
    saving: string
    // Planning further out than one week.
    planTitle: string
    planHelp: string
    viewWeek: string
    viewMonth: string
    prev: string
    next: string
    thisWeek: string
    thisMonth: string
    closed: string
    blocked: string
    free: string
    booking: string
    bookings: string
    openDay: string
    blockThisDay: string
  }
  chamadas: {
    title: string
    filterResult: string
    filterFrom: string
    filterTo: string
    empty: string
    detail: string
    noSummary: string
    audio: string
    noAudio: string
    duration: string
  }
  comecar: {
    navGroup: string
    navItem: string
    eyebrow: string
    greeting: string
    title: string
    lead: string
    statusOff: string
    statusOffHelp: string
    progress: string
    here: string
    stageWaiting: string
    stageDone: string
    stages: Record<
      'clinica' | 'linhaReady' | 'linhaWaiting' | 'ativar',
      { title: string; body: string }
    >
  }
  conta: {
    title: string
    /** The three doors behind the clinic's name in the sidebar. */
    accountMenu: string
    billingTitle: string
    securityTitle: string
    /** Where the password is changed. There was no link to it anywhere
     *  in the panel, so the only route anybody would find on their own
     *  was "I forgot my password". */
    accessTitle: string
    accessHelp: string
    changePassword: string
    clinicData: string
    plan: string
    addon: string
    addonOn: string
    addonOff: string
    usageTitle: string
    minutesUsed: string
    limit: string
    contactSupport: string
    // The little the clinic may change about how its panel looks.
    brandingTitle: string
    brandingHelp: string
    logo: string
    logoHelp: string
    logoChoose: string
    logoRemove: string
    logoSaving: string
    logoTooBig: string
    logoBadType: string
    themeTitle: string
    themeHelp: string
    themes: Record<'light' | 'dark', string>
    accentTitle: string
    accentHelp: string
    accents: Record<'brand' | 'ocean' | 'plum' | 'clay' | 'slate', string>
    // What happens to a pre-marcação nobody has answered yet. `{minutes}` is
    // replaced with the length of the hold.
    /** Who says a booking is real: Telma inside the call, or a person in
     *  the panel. The second half of the same screen, how long an
     *  unanswered booking holds its hour, only applies to the latter. */
    modeTitle: string
    modeHelp: string
    modeAutoTitle: string
    modeAutoHelp: string
    modeManualTitle: string
    modeManualHelp: string
    modeBlocked: string
    holdMinutesTitle: string
    holdMinutesHelp: string
    holdMinutesOption: string
    holdHoursOption: string
    holdTitle: string
    holdHelp: string
    holdAutoTitle: string
    holdAutoHelp: string
    holdManualTitle: string
    holdManualHelp: string
  }
  // Minutes, extras and what they cost. Split across two screens: the meter and
  // the way to top it up live on the day, because that is where running out
  // hurts; the plan, the extras and the receipts live in the clinic's own
  // screen, because that is where somebody goes to decide something.
  billing: {
    minutesTitle: string
    percentUsed: string
    minutesWord: string
    minuteWord: string
    remaining: string
    includesPurchased: string
    nearLimit: string
    exhausted: string
    insteadOf: string
    /** Shown to the administrator visiting a panel, who buys nothing. */
    readOnly: string
    buyCta: string
    buyTitle: string
    minutesPerPack: string
    minutesAdded: string
    quantity: string
    quantityLess: string
    quantityMore: string
    coupon: string
    couponPlaceholder: string
    couponApplied: string
    couponUnknown: string
    discount: string
    toPay: string
    confirm: string
    working: string
    buyHelp: string
    planTitle: string
    planName: string
    price: string
    priceOnRequest: string
    perMonth: string
    perYear: string
    includedMinutes: string
    renewsAt: string
    locations: string
    changePlanHelp: string
    addonsTitle: string
    addonActive: string
    addonIncluded: string
    addonActivate: string
    addonSoon: string
    addonNotOnPlan: string
    addonFree: string
    historyTitle: string
    historyEmpty: string
    colItem: string
    colQuantity: string
    colPrice: string
    status: Record<'pending' | 'completed' | 'failed' | 'refunded', string>
    errors: Record<
      'demo' | 'forbidden' | 'item' | 'plan_incompatible' | 'already_active' | 'coming_soon' | 'generic',
      string
    >
  }
  // A call without a phone. Development and demo only: it writes real rows,
  // which is the only way it proves anything.
  testCall: {
    title: string
    subtitle: string
    warning: string
    stateClinic: string
    statePlan: string
    stateMinutes: string
    stateAddons: string
    stateNoAddons: string
    patientName: string
    duration: string
    minutesWord: string
    resultType: string
    results: Record<'marcacao' | 'transferida' | 'informacao', { label: string; help: string }>
    submit: string
    working: string
    clear: string
    cleared: string
    /** The requests the voice agent makes, in the order it makes them. */
    steps: Record<'context' | 'availability' | 'appointment' | 'call', string>
    bookedFor: string
    meter: string
    seeAgenda: string
    seeAccount: string
    /** `{name}` is replaced with the patient's name. */
    outcomes: Record<
      'booked' | 'no_minutes' | 'no_slots' | 'transferred' | 'informed' | 'error',
      { title: string; description: string }
    >
    errors: Record<'forbidden' | 'unavailable' | 'clinic' | 'generic', string>
  }
  /**
   * Las cinco superficies que llevaban su propia tabla de copy dentro del
   * componente, con portugués y español y sin inglés. Viven aquí para que un
   * idioma nuevo sea un fichero y no una búsqueda por el árbol.
   */
  noAccess: {
    title: string
    /** Showcase: hay un solo panel, el de la clínica. */
    demo: string
    /** Fuera del showcase: la cuenta no tiene panel asociado. */
    plain: string
    signUp: string
    out: string
  }
  voiceSimulator: {
    lead: string
    knows: string
    opens: string
    after: string
    refresh: string
    loading: string
    nothing: string
    transcript: string
    inPanel: string
    booked: string
    noBooking: string
    mic: string
  }
  telmaForm: {
    save: string
    saving: string
    saved: string
    unsaved: string
    failed: string
    clinic: string
    services: string
    telma: string
    effect: string
    previewHelp: string
  }
  clinicIdentity: {
    save: string
    saving: string
    saved: string
    failed: string
  }
  promptPreview: {
    title: string
    help: string
    greeting: string
    listen: string
    listening: string
    stop: string
    show: string
    hide: string
    errNoKey: string
    errNoPermission: string
    errFailed: string
    errNoVoice: string
  }
  interno: {
    clinicsTitle: string
    clinicsSubtitle: string
    searchPlaceholder: string
    colName: string
    colPlan: string
    colStatus: string
    colUsage: string
    colActivity: string
    overLimit: string
    nearLimit: string
    newClinic: string
    never: string
    // ficha
    fichaData: string
    fichaTechnical: string
    assignedPhone: string
    agentId: string
    voiceName: string
    fichaSlots: string
    fichaCalls: string
    fichaAppointments: string
    openFicha: string
    // nova
    newTitle: string
    newHelp: string
    fieldClinicName: string
    fieldAddress: string
    fieldPhone: string
    fieldContactEmail: string
    fieldPlan: string
    fieldAddon: string
    fieldUserEmail: string
    fieldUserName: string
    fieldTempPassword: string
    createClinic: string
    creating: string
    createdOk: string
    defaultSlotsNote: string
    // consumo
    consumoTitle: string
    consumoSubtitle: string
    totalCalls: string
    totalMinutes: string
    estimatedCost: string
    perClinic: string
    // atividade
    atividadeTitle: string
    atividadeSubtitle: string
    atividadeEmpty: string
    eventTypes: Record<string, string>
  }
  crm: {
    // Enum labels. The database stores neutral keys; only these change.
    stage: Record<CrmStage, string>
    result: Record<CrmResult, string>
    activityType: Record<CrmActivityType, string>
    specialty: Record<CrmSpecialty, string>
    contactRole: Record<CrmContactRole, string>
    origin: Record<CrmOrigin, string>
    country: Record<CrmCountry, string>
    nav: {
      section: string
      hoje: string
      prospetos: string
      novo: string
      equipa: string
    }
    today: {
      title: string
      subtitle: string
      live: string
      overdue: string
      dueToday: string
      tabToday: string
      tabNoDate: string
      scopeMine: string
      scopeTeam: string
      empty: string
      emptyNoDate: string
      noDateHelp: string
      call: string
      log: string
      lateBy: string
      at: string
    }
    list: {
      title: string
      subtitle: string
      searchPlaceholder: string
      filters: string
      filterRep: string
      filterCountry: string
      filterStage: string
      filterOrigin: string
      referredOnly: string
      coldOnly: string
      filterFrom: string
      filterTo: string
      unassignedOnly: string
      mine: string
      apply: string
      clear: string
      empty: string
      results: string
      export: string
      take: string
      taken: string
      colName: string
      colStage: string
      colRep: string
      colNext: string
      colZone: string
      noNext: string
      unassigned: string
      viewList: string
      viewMap: string
      openRecord: string
      directions: string
      nearMe: string
      locating: string
      noPosition: string
      noPins: string
    }
    log: {
      title: string
      what: string
      note: string
      notePlaceholder: string
      next: string
      tomorrowMorning: string
      tomorrowAfternoon: string
      inTwoHours: string
      pickDateTime: string
      noNext: string
      save: string
      saving: string
      queued: string
      offline: string
      close: string
      needResult: string
    }
    detail: {
      call: string
      whatsapp: string
      contacts: string
      addContact: string
      contactName: string
      contactRole: string
      contactPhone: string
      contactNotes: string
      noContacts: string
      history: string
      noHistory: string
      logCall: string
      nextAction: string
      noNextAction: string
      assign: string
      assignHelp: string
      reassign: string
      details: string
      origin: string
      website: string
      address: string
      convert: string
      convertHelp: string
      convertRequest: string
      convertRequested: string
      convertedTo: string
      openClient: string
      requestSent: string
    }
    novo: {
      title: string
      help: string
      pasteTitle: string
      pasteHelp: string
      pastePlaceholder: string
      pasteAction: string
      name: string
      phone: string
      zone: string
      specialty: string
      country: string
      address: string
      website: string
      origin: string
      originNote: string
      originNotePlaceholder: string
      contactTitle: string
      create: string
      creating: string
      dupTitle: string
      dupProspect: string
      dupClient: string
      dupAssigned: string
      dupUnassigned: string
      dupOpen: string
      dupCreateAnyway: string
      dupChecking: string
    }
    resumo: {
      title: string
      subtitle: string
      attention: string
      overdue: string
      noDate: string
      unassigned: string
      funnel: string
      funnelHint: string
      byZone: string
      byZoneHint: string
      otherZones: string
      week: string
      weekCalls: string
      weekClinics: string
      weekInterested: string
      weekWon: string
      empty: string
      nothingPending: string
    }
    team: {
      title: string
      subtitle: string
      summary: string
      newRep: string
      newRepHelp: string
      fullName: string
      email: string
      tempPassword: string
      country: string
      territory: string
      language: string
      repRole: string
      create: string
      creating: string
      active: string
      inactive: string
      activate: string
      deactivate: string
      activeProspects: string
      overdue: string
      wonThisMonth: string
      noReps: string
      unassignedPool: string
    }
  }
}
