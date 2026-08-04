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
    today: string
    signOut: string
    language: string
    copy: string
    copied: string
    patient: string
    phone: string
    email: string
    name: string
    reason: string
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
      'pendente' | 'confirmada' | 'rejeitada' | 'copiada' | 'cancelada',
      string
    >
    clinic: Record<'ativa' | 'pausada' | 'cancelada', string>
    call: Record<'marcacao' | 'transferida' | 'informacao' | 'nao_resolvida', string>
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
    hoje: string
    marcacoes: string
    horarios: string
    chamadas: string
    conta: string
  }
  // The clinic's home screen: the day, and what needs an answer before it.
  agenda: {
    title: string
    greeting: string
    live: string
    liveLost: string
    liveRetry: string
    updated: string
    attention: string
    attentionNone: string
    needsAnswer: string
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
    doneCalls: string
    doneWhatsapp: string
    doneBookings: string
    doneCancelled: string
    doneInfo: string
    seeConversations: string
    openConversation: string
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
    filterAll: string
    filterPending: string
  }
  horarios: {
    title: string
    help: string
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
  conta: {
    title: string
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
    accentTitle: string
    accentHelp: string
    accents: Record<'brand' | 'ocean' | 'plum' | 'clay' | 'slate', string>
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
