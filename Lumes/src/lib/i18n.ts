// Internationalization (i18n) — Portuguese (primary) + English (optional)
// Usage: import { t } from "@/lib/i18n"; t(lang, "key")
//
// Portuguese is the primary language. English is the secondary, opt-in
// language. All user-facing strings should be wrapped in t(lang, "key")
// and listed here. When you add a new t() key, add BOTH languages.

export type Language = "pt" | "en";

export const translations = {
  // App
  app: {
    name: { pt: "lumes.pt", en: "lumes.pt" },
    tagline: { pt: "Inteligência de Incêndios", en: "Wildfire Intel" },
    defaultLocale: { pt: "Português (Portugal)", en: "Portuguese (Portugal)" },
  },

  // Live data connection state (badge in left sidebar)
  // Portuguese uses full words; English uses short labels.
  live: {
    rt: { pt: "Em direto", en: "Live" },        // Real-time SSE
    fb: { pt: "Alternativo", en: "Fallback" },   // Polling fallback
    live: { pt: "Ao vivo", en: "Live" },        // Generic
  },

  // Data source labels (left sidebar panel) — keyed by /api/source-health IDs
  dataSources: {
    "anepc-prociv-arcgis": { pt: "Ocorrências ANEPC", en: "ANEPC Occurrences" },
    "ipma-fire-risk": { pt: "Risco de Incêndio (IPMA)", en: "Fire Risk (IPMA)" },
    "ipma-weather": { pt: "Meteorologia (IPMA)", en: "Weather (IPMA)" },
    "ipma-warnings": { pt: "Avisos Meteorológicos", en: "Weather Warnings" },
    "anepc-regional-commands": { pt: "Comandos Regionais ANEPC", en: "ANEPC Regional Commands" },
    "osm-fire-stations": { pt: "Quartéis de Bombeiros (OSM)", en: "Fire Stations (OSM)" },
    "nasa-firms-viirs": { pt: "Satélite NASA FIRMS", en: "NASA FIRMS Satellite" },
  },

  // Top-bar / header common actions
  playback: {
    now: { pt: "AGORA", en: "NOW" },
    nowLabel: { pt: "Saltar para o presente", en: "Jump to present" },
    past: { pt: "{n} horas atrás", en: "{n} hours ago" },
  },
  error: {
    sectionTitle: { pt: "Não foi possível carregar", en: "Could not load" },
    sectionMessage: { pt: "Verifique a sua ligação e tente novamente.", en: "Check your connection and try again." },
    retry: { pt: "Tentar novamente", en: "Retry" },
    noIncidents: { pt: "Sem incêndios ativos", en: "No active fires" },
    noIncidentsDesc: { pt: "Não há incêndios ativos no momento. Boa notícia.", en: "There are no active fires right now. Good news." },
    noPriority: { pt: "Sem incêndios prioritários", en: "No priority incidents" },
    noPriorityDesc: { pt: "Nenhum incêndio crítico ou elevado no momento.", en: "No critical or high-severity incidents at the moment." },
    noFollowed: { pt: "Não segue nenhum incêndio", en: "Not following any incidents" },
    noFollowedDesc: { pt: "Toque em \"Seguir\" num incêndio para receber atualizações em tempo real.", en: "Tap \"Follow\" on an incident to get realtime updates." },
    noSources: { pt: "A verificar fontes de dados…", en: "Checking data sources…" },
  },
  mobile: {
    notifications: { pt: "Notificações", en: "Notifications" },
    history: { pt: "Histórico", en: "History" },
    historyDesc: { pt: "incidentes registados", en: "tracked" },
    reportFire: { pt: "Comunicar Incêndio", en: "Report Fire" },
    reportFireDesc: { pt: "Para emergências, ligue 117", en: "For emergencies, call 117" },
    theme: { pt: "Tema", en: "Theme" },
    themeDark: { pt: "Escuro", en: "Dark" },
    themeLight: { pt: "Claro", en: "Light" },
    systemStatus: { pt: "Estado do sistema", en: "System status" },
    systemStatusDesc: { pt: "Saúde das fontes de dados", en: "Data source health" },
    share: { pt: "Partilhar Lumes", en: "Share Lumes" },
    shareDesc: { pt: "Partilhe com a sua comunidade", en: "Share with your community" },
    shareText: { pt: "Mapa de incêndios em Portugal", en: "Portugal wildfire map" },
    linkCopied: { pt: "Link copiado", en: "Link copied" },
    unread: { pt: "não lidas", en: "unread" },
  },
  a11y: {
    skipToMap: { pt: "Saltar para o mapa", en: "Skip to map" },
    closePanel: { pt: "Fechar painel", en: "Close panel" },
    closeNotifications: { pt: "Fechar notificações", en: "Close notifications" },
    closeHistory: { pt: "Fechar histórico", en: "Close history" },
    closeShortcuts: { pt: "Fechar atalhos", en: "Close shortcuts" },
    markAllRead: { pt: "Marcar tudo como lido", en: "Mark all read" },
    clearSearch: { pt: "Limpar pesquisa", en: "Clear search" },
  },
  header: {
    cancel: { pt: "Cancelar", en: "Cancel" },
    submit: { pt: "Submeter", en: "Submit" },
    close: { pt: "Fechar", en: "Close" },
    save: { pt: "Guardar", en: "Save" },
    markAllRead: { pt: "Marcar tudo como lido", en: "Mark all read" },
    notifications: { pt: "Notificações", en: "Notifications" },
    viewNotifications: { pt: "Ver notificações", en: "View notifications" },
    notificationsWithUnread: { pt: "Notificações, {count} não lidas", en: "Notifications, {count} unread" },
    switchToPortuguese: { pt: "Mudar para Português", en: "Switch to Portuguese" },
    switchToEnglish: { pt: "Switch to English", en: "Switch to English" },
    primary: { pt: "Principal", en: "Primary" },
  },

  // Common shared strings
  common: {
    loading: { pt: "A carregar…", en: "Loading…" },
    clear: { pt: "Limpar", en: "Clear" },
    close: { pt: "Fechar", en: "Close" },
    cancel: { pt: "Cancelar", en: "Cancel" },
    save: { pt: "Guardar", en: "Save" },
    edit: { pt: "Editar", en: "Edit" },
    delete: { pt: "Eliminar", en: "Delete" },
  },

  // Sidebar — brand
  sidebar: {
    quickStats: { pt: "Estatísticas", en: "Quick Stats" },
    following: { pt: "A seguir", en: "Following" },
    tracked: { pt: "Registados", en: "Tracked" },
    snapshots: { pt: "Snapshots", en: "Snapshots" },
    sources: { pt: "Fontes", en: "Sources" },
    fireRisk: { pt: "Risco de Incêndio (IPMA)", en: "Fire Risk (IPMA)" },
    conditions: { pt: "Condições", en: "Conditions" },
    conditionsLocation: { pt: "Portugal", en: "Portugal" },
    stations: { pt: "estações", en: "stns" },
    districts: { pt: "concelhos", en: "municipalities" },
    mapLayers: { pt: "Camadas do Mapa", en: "Map Layers" },
    filters: { pt: "Filtros", en: "Filters" },
    dataSources: { pt: "Fontes de Dados", en: "Data Sources" },
    notifications: { pt: "Notificações", en: "Notifications" },
    reportFire: { pt: "Comunicar Incêndio", en: "Report Fire" },
    search: { pt: "Procurar localização…", en: "Search location…" },
    basemap: { pt: "Mapa base", en: "Basemap" },
    dark: { pt: "Escuro", en: "Dark" },
    light: { pt: "Claro", en: "Light" },
    sat: { pt: "Satélite", en: "Sat" },
    fireRiskLayer: { pt: "Risco de Incêndio", en: "Fire Risk" },
    fireStations: { pt: "Quartéis de Bombeiros", en: "Fire Stations" },
    criticalOnly: { pt: "Apenas críticos", en: "Critical only" },
    hideResolved: { pt: "Ocultar resolvidos", en: "Hide resolved" },
    severity: { pt: "Severidade", en: "Severity" },
    sourcesFilter: { pt: "Fontes", en: "Sources" },
    legend: { pt: "Legenda", en: "Legend" },
    clickToFilter: { pt: "Clique num nível para filtrar o mapa", en: "Click a level to filter the map" },
    showAll: { pt: "← Mostrar todos os níveis", en: "← Show all risk levels" },
    weatherWarnings: { pt: "Avisos Meteorológicos", en: "Weather Warnings" },
    title: { pt: "Painel de filtros", en: "Filters panel" },
    sidePanel: { pt: "Painel Lateral", en: "Side Panel" },
    clear: { pt: "Limpar", en: "Clear" },
  },

  // Risk levels
  risk: {
    reduced: { pt: "Reduzido", en: "Reduced" },
    moderate: { pt: "Moderado", en: "Moderate" },
    high: { pt: "Elevado", en: "High" },
    veryHigh: { pt: "Muito Elevado", en: "Very High" },
    maximum: { pt: "Máximo", en: "Maximum" },
  },

  // Severity
  severity: {
    critical: { pt: "Crítico", en: "Critical" },
    high: { pt: "Elevado", en: "High" },
    medium: { pt: "Médio", en: "Medium" },
    low: { pt: "Baixo", en: "Low" },
  },

  // Status
  status: {
    detected: { pt: "Detetado", en: "Detected" },
    active: { pt: "Ativo", en: "Active" },
    contained: { pt: "Contido", en: "Contained" },
    resolved: { pt: "Resolvido", en: "Resolved" },
    monitoring: { pt: "Vigilância", en: "Monitoring" },
  },

  // Dashboard
  dashboard: {
    activeFilter: { pt: "Filtro ativo", en: "Active filter" },
    title: { pt: "Consciência Situacional", en: "Situational Awareness" },
    subtitle: { pt: "Vista geral em tempo real · Portugal", en: "Live overview · Portugal" },
    liveIncidents: { pt: "Incêndios Ativos", en: "Live Incidents" },
    total: { pt: "Total", en: "Total" },
    active: { pt: "Ativos", en: "Active" },
    critical: { pt: "Críticos", en: "Critical" },
    high: { pt: "Elevados", en: "High" },
    resourcesDeployed: { pt: "Meios Empenhados", en: "Resources Deployed" },
    personnel: { pt: "Operacionais", en: "Personnel" },
    engines: { pt: "Veículos", en: "Engines" },
    aircraft: { pt: "Aeronaves", en: "Aircraft" },
    areaBurned: { pt: "Área ardida", en: "Area burned" },
    priority: { pt: "Prioridade", en: "Priority" },
    recent: { pt: "Recentes", en: "Recent" },
    all: { pt: "Todos", en: "All" },
    details: { pt: "Detalhe", en: "Details" },
    resourcesDeployed: { pt: "Meios Empenhados", en: "Resources Deployed" },
    operationalPhases: { pt: "Fases Operacionais", en: "Operational Phases" },
    topPriority: { pt: "Incêndios Prioritários", en: "Top Priority Incidents" },
    topPriority: { pt: "Incêndios Prioritários", en: "Top Priority Incidents" },
    recentActivity: { pt: "Atividade Recente", en: "Recent Activity" },
    allActive: { pt: "Todos os Incêndios Ativos", en: "All Active Incidents" },
    distribution: { pt: "Distribuição por Tipo", en: "Distribution by Type" },
    systemHealth: { pt: "Saúde do Sistema", en: "System Health" },
    incidentHistory: { pt: "Histórico de Incêndios", en: "Incident History" },
    viewAll: { pt: "Ver todos →", en: "View all →" },
    activityPriority: { pt: "Prioridade", en: "Priority" },
    activityRecent: { pt: "Recentes", en: "Recent" },
    activityAll: { pt: "Todos", en: "All" },
    quickFilterAll: { pt: "Todos", en: "All" },
    quickFilterCritical: { pt: "Críticos", en: "Critical" },
    quickFilterHigh: { pt: "Elevados+", en: "High+" },
    quickFilterActive: { pt: "Ativos", en: "Active" },
    total: { pt: "no total", en: "total" },
  },

  // Incident detail
  incident: {
    overview: { pt: "Resumo", en: "Overview" },
    timeline: { pt: "Cronologia", en: "Timeline" },
    sources: { pt: "Fontes", en: "Sources" },
    conditions: { pt: "Condições", en: "Conditions" },
    wind: { pt: "Vento", en: "Wind" },
    humidity: { pt: "Humidade", en: "Humidity" },
    temp: { pt: "Temp", en: "Temp" },
    aircraft: { pt: "Aeronaves", en: "Aircraft" },
    aircraftActive: { pt: "ativas", en: "active" },
    engines: { pt: "Veículos", en: "Engines" },
    enginesDeployed: { pt: "destacados", en: "deployed" },
    personnel: { pt: "Operacionais", en: "Personnel" },
    personnelOnScene: { pt: "em cena", en: "on scene" },
    resources: { pt: "Meios empenhados", en: "Resources deployed" },
    areaBurned: { pt: "Área ardida", en: "Area burned" },
    notEstimated: { pt: "Não estimada", en: "Not estimated" },
    fireRisk: { pt: "Risco de Incêndio", en: "Fire risk" },
    sourceIPMA: { pt: "Fonte: IPMA", en: "Source: IPMA" },
    firstDetected: { pt: "Primeira deteção", en: "First detected" },
    roadClosures: { pt: "Encerramentos de estradas", en: "Road closures" },
    followIncident: { pt: "Seguir este incêndio", en: "Follow this incident" },
    followingBadge: { pt: "A seguir", en: "Following" },
    following: { pt: "A seguir — clique para deixar de seguir", en: "Following — click to unfollow" },
    confidence: { pt: "confiança", en: "confidence" },
    live: { pt: "Em direto", en: "Live" },
    details: { pt: "Detalhes", en: "Details" },
    close: { pt: "Fechar", en: "Close" },
    copyShareLink: { pt: "Copiar link de partilha", en: "Copy share link" },
    shareTitle: { pt: "Incêndio — Lumes", en: "Incident — Lumes" },
    shareDescription: { pt: "Veja este incêndio em lumes.pt", en: "View this incident on lumes.pt" },
    shareCopied: { pt: "Link copiado", en: "Link copied" },
  },

  // Map controls
  map: {
    incidentsVisible: { pt: "incêndios", en: "incidents" },
    zoomIn: { pt: "Ampliar", en: "Zoom in" },
    zoomOut: { pt: "Reduzir", en: "Zoom out" },
    resetView: { pt: "Repor vista de Portugal", en: "Reset view to Portugal" },
    locate: { pt: "Centrar no incidente selecionado", en: "Center map on selected incident" },
    total: { pt: "Total: {count} incêndios", en: "Total: {count} fires" },
    activeTap: { pt: "{count} incêndios ativos — toque para abrir o painel", en: "{count} active fires — tap to open dashboard" },
    totalLabel: { pt: "incêndios", en: "fires" },
    totalLabelCompact: { pt: "", en: "" },
  },

  // Playback
  playback: {
    title: { pt: "Reprodução Histórica", en: "Historical Playback" },
    now: { pt: "AGORA", en: "NOW" },
    skipBack: { pt: "Recuar", en: "Skip back" },
    skipForward: { pt: "Avançar", en: "Skip forward" },
    play: { pt: "Reproduzir", en: "Play" },
    pause: { pt: "Pausar", en: "Pause" },
  },

  // History modal
  history: {
    title: { pt: "Histórico de Incêndios", en: "Incident History" },
    subtitle: { pt: "incidentes registados · ordenados por mais recentes", en: "incidents tracked · sorted by most recent" },
    search: { pt: "Procurar nome, concelho…", en: "Search name, municipality…" },
    all: { pt: "todos", en: "all" },
    showing: { pt: "A mostrar", en: "Showing" },
    of: { pt: "de", en: "of" },
    openArchive: { pt: "Abrir arquivo", en: "Open archive" },
  },

  // Report fire
  report: {
    title: { pt: "Comunicar Incêndio", en: "Report Fire" },
    subtitle: { pt: "Comunidade · Fase 2", en: "Community Report · Phase 2" },
    emergency: { pt: "Para emergências, ligue 117.", en: "For emergencies, call 117." },
    emergencyDesc: { pt: "Este formulário é para consciencialização da comunidade, não para resposta de emergência.", en: "This form is for community awareness, not emergency response." },
    reportType: { pt: "Tipo de Comunicação", en: "Report Type" },
    smoke: { pt: "Avistamento de Fumo", en: "Smoke Sighting" },
    flame: { pt: "Chama Ativa", en: "Active Flame" },
    roadClosure: { pt: "Encerramento de Estrada", en: "Road Closure" },
    evacuation: { pt: "Aviso de Evacuação", en: "Evacuation Notice" },
    contained: { pt: "Incêndio Contido", en: "Fire Contained" },
    location: { pt: "Localização", en: "Location" },
    captureLocation: { pt: "Capturar a minha localização", en: "Capture my location" },
    gettingLocation: { pt: "A obter localização…", en: "Getting location…" },
    description: { pt: "Descrição (opcional)", en: "Description (optional)" },
    descriptionPlaceholder: { pt: "Descreva o que vê (direção do fumo, tamanho do fogo, etc.)", en: "Describe what you see (smoke direction, fire size, etc.)" },
    yourName: { pt: "O seu nome (opcional)", en: "Your name (optional)" },
    anonymous: { pt: "Anónimo", en: "Anonymous" },
    submit: { pt: "Enviar Comunicação", en: "Submit Report" },
    cancel: { pt: "Cancelar", en: "Cancel" },
    update: { pt: "Atualizar", en: "Update" },
    moderationNote: { pt: "As comunicações são revistas por moderadores antes de serem publicadas.", en: "Reports are reviewed by moderators before display." },
    reviewed: { pt: "As comunicações são revistas por moderadores antes da exibição.", en: "Reports are reviewed by moderators before display." },
    geoNotSupported: { pt: "Geolocalização não suportada pelo seu navegador", en: "Geolocation not supported by your browser" },
    geoFailed: { pt: "Não foi possível obter a localização", en: "Could not get location" },
    geoPermissionDenied: { pt: "Permissão de localização negada", en: "Permission denied" },
    geoPositionUnavailable: { pt: "Localização indisponível", en: "Position unavailable" },
    geoTimeout: { pt: "Tempo esgotado ao obter localização", en: "Location request timed out" },
    locationCaptured: { pt: "Localização capturada", en: "Location captured" },
    captureLocationFirst: { pt: "Capture primeiro a sua localização", en: "Please capture your location first" },
    submissionFailed: { pt: "Falha ao enviar comunicação", en: "Submission failed" },
  },

  // Notifications
  notifications: {
    title: { pt: "Notificações", en: "Notifications" },
    unread: { pt: "não lidas", en: "unread" },
    markAllRead: { pt: "Marcar todas como lidas", en: "Mark all read" },
    bypassQuiet: { pt: "Motor de notificações · Alertas críticos ignoram horas de descanso", en: "Notification engine · Critical alerts bypass quiet hours" },
  },

  // Toast messages
  toast: {
    newIncident: { pt: "Novo incidente detetado", en: "New incident detected" },
    newIncidentDesc: { pt: "Nova ocorrência de incêndio", en: "New fire occurrence" },
    refreshing: { pt: "A atualizar incidentes…", en: "Refreshing incidents…" },
    refreshed: { pt: "Incidentes atualizados", en: "Incidents refreshed" },
    refreshFailed: { pt: "Falha ao atualizar", en: "Refresh failed" },
    liveUnavailable: { pt: "Dados em direto indisponíveis", en: "Live data unavailable" },
    fallbackDesc: { pt: "A usar dados de exemplo. Verifique a saúde das fontes.", en: "Falling back to sample data. Check source health." },
    liveRestored: { pt: "Dados em direto restaurados", en: "Live data restored" },
    followed: { pt: "A seguir incidente", en: "Following incident" },
    unfollowed: { pt: "Deixou de seguir", en: "Unfollowed" },
    linkCopied: { pt: "Link copiado", en: "Link copied" },
    reportSubmitted: { pt: "Comunicação enviada", en: "Report submitted" },
    reportDesc: { pt: "A sua comunicação foi recebida e será revista por moderadores.", en: "Your report has been received and will be reviewed by moderators." },
    locationCaptured: { pt: "Localização capturada", en: "Location captured" },
    locationFailed: { pt: "Não foi possível obter a localização", en: "Could not get location" },
    centeredOn: { pt: "Centrado em", en: "Centered on" },
    resetView: { pt: "Vista repost para Portugal", en: "Reset view to Portugal" },
    showingAll: { pt: "A mostrar todos os incidentes", en: "Showing all incidents" },
  },

  // Keyboard shortcuts
  shortcuts: {
    title: { pt: "Atalhos de teclado", en: "Keyboard shortcuts" },
    focusSearch: { pt: "Focar pesquisa", en: "Focus search" },
    refresh: { pt: "Atualizar incidentes", en: "Refresh incidents" },
    follow: { pt: "Seguir / deixar de seguir incidente", en: "Follow / unfollow incident" },
    locate: { pt: "Localizar incidente selecionado", en: "Locate selected incident" },
    close: { pt: "Fechar painel / janela", en: "Close panel / drawer" },
    toggleHelp: { pt: "Alternar esta ajuda", en: "Toggle this help" },
  },

  // News (sidebar)
  news: {
    title: { pt: "Notícias", en: "News" },
    matched: { pt: "Combinadas", en: "Matched" },
    press: { pt: "Imprensa", en: "Press" },
    sources: { pt: "Fontes", en: "Sources" },
    match: { pt: "combina", en: "match" },
    noMatched: {
      pt: "Sem notícias combinadas — as fontes RSS não mencionam concelhos com incêndios ativos no momento.",
      en: "No matched news — RSS sources are not currently mentioning municipalities with active fires.",
    },
    noPress: {
      pt: "Sem notícias de imprensa sobre incêndios nas últimas horas.",
      en: "No press coverage about fires in the last hours.",
    },
  },

  legend: {
    satellite: { pt: "Deteção satélite", en: "Satellite detection" },
    community: { pt: "Comunicação cidadão", en: "Community report" },
    evacuation: { pt: "Zona de evacuação", en: "Evacuation zone" },
  },

  // Advanced layer labels
  aerial: {
    response: { pt: "Resposta aérea", en: "Aerial response" },
  },
  biomass: {
    fuel: { pt: "Biomassa", en: "Biomass" },
    combustion: { pt: "combustível", en: "fuel" },
    biomassMeteo: { pt: "biomassa × meteo", en: "biomass × meteo" },
  },
  composite: {
    label: { pt: "Risco composto", en: "Composite risk" },
  },
  advanced: {
    title: { pt: "Avançadas", en: "Advanced" },
  },

  // Time
  time: {
    justNow: { pt: "agora mesmo", en: "just now" },
    minutesAgo: { pt: "min atrás", en: "m ago" },
    hoursAgo: { pt: "h atrás", en: "h ago" },
    daysAgo: { pt: "d atrás", en: "d ago" },
  },

  // Error boundary
  error: {
    title: { pt: "Algo correu mal", en: "Something went wrong" },
    description: {
      pt: "A aplicação encontrou um erro inesperado. Tente novamente ou volte à página inicial.",
      en: "The application hit an unexpected error. Try again or return to the home page.",
    },
    technicalDetails: { pt: "Detalhes técnicos", en: "Technical details" },
    tryAgain: { pt: "Tentar novamente", en: "Try again" },
    goHome: { pt: "Ir ao início", en: "Go home" },
  },

} as const;

// Helper function to get a translation
export function t(lang: Language, path: string): string {
  const keys = path.split(".");
  let val: any = translations;
  for (const k of keys) {
    val = val?.[k];
    if (val == null) break;
  }
  if (val && typeof val === "object" && val[lang]) return val[lang];
  return path; // Fallback to the key itself
}

/**
 * tFmt — translated string with placeholder substitution.
 * Use {key} in the i18n string, e.g. "{count} active fires".
 * tFmt(lang, "map.total", { count: 33 }) -> "Total: 33 active fires"
 */
export function tFmt(
  lang: Language,
  path: string,
  params: Record<string, string | number> = {},
): string {
  let s = t(lang, path);
  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return s;
}

// Helper to get the user's preferred language from browser
export function detectLanguage(): Language {
  if (typeof navigator === "undefined") return "pt";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("pt")) return "pt";
  return "en";
}
