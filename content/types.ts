// Typed dictionary shared by every language, mirroring the landing approach.
// To add a language: create content/<lang>.ts implementing Dictionary and
// register it in content/index.ts.

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
    appointment: Record<'pendente' | 'confirmada' | 'rejeitada' | 'copiada', string>
    clinic: Record<'ativa' | 'pausada' | 'cancelada', string>
    call: Record<'marcacao' | 'transferida' | 'informacao' | 'nao_resolvida', string>
    origin: Record<'telefone' | 'whatsapp', string>
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
  clinicNav: {
    hoje: string
    marcacoes: string
    horarios: string
    chamadas: string
    conta: string
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
    callsUsed: string
    limit: string
    contactSupport: string
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
}
