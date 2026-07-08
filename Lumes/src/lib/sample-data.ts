// Sample wildfire incident data for the Ember citizen map prototype
// Coordinates use real Portuguese locations near actual high-risk zones

export type SourceType = "satellite" | "official" | "community" | "news" | "weather";
export type VerificationStatus = "unverified" | "single-source" | "corroborated" | "officially-verified";
export type IncidentStatus = "detected" | "active" | "contained" | "resolved" | "monitoring";
export type Severity = "low" | "medium" | "high" | "critical";

export interface TimelineEvent {
  id: string;
  timestamp: string;       // ISO 8601
  sourceType: SourceType;
  sourceName: string;
  type: "detection" | "status_change" | "report" | "article" | "weather" | "evacuation" | "deployment";
  title: string;
  description: string;
  confidence: number;      // 0-1
  verification: VerificationStatus;
}

export interface Incident {
  id: string;
  displayName: string;
  status: IncidentStatus;
  severity: Severity;
  latitude: number;
  longitude: number;
  accuracyM: number;
  estimatedAreaHa: number;
  firstDetected: string;   // ISO 8601
  lastUpdated: string;     // ISO 8601
  confidence: number;      // 0-1, aggregate
  verification: VerificationStatus;
  sourceCount: number;
  sourceTypes: SourceType[];
  windKmh: number;
  windDirection: string;   // "SE", "NW" etc.
  humidity: number;        // %
  temperatureC: number;
  aircraft: number;
  engines: number;
  personnel: number;
  municipality: string;
  district: string;
  parish: string;
  ipmaRisk: "reduced" | "moderate" | "high" | "very_high" | "maximum";
  timeline: TimelineEvent[];
  description: string;
  evacuationOrder?: boolean;
  roadClosures?: string[];
}

// T-24h playback positions (relative hours from now=0)
// Each incident has a "detection moment" and an evolution over the past 24h
export interface PlaybackFrame {
  hourOffset: number;        // -24 to 0
  activeIncidentIds: string[];
  highlights: { incidentId: string; note: string }[];
}

// === Sample incidents — Portuguese-realistic coordinates ===
export const SAMPLE_INCIDENTS: Incident[] = [
  {
    id: "inc-monchique-2026",
    displayName: "Serra de Monchique Fire",
    status: "active",
    severity: "critical",
    latitude: 37.3147,
    longitude: -8.5574,
    accuracyM: 750,
    estimatedAreaHa: 1240,
    firstDetected: "2026-07-03T14:22:00Z",
    lastUpdated: "2026-07-04T13:50:00Z",
    confidence: 0.92,
    verification: "officially-verified",
    sourceCount: 7,
    sourceTypes: ["satellite", "official", "community", "news"],
    windKmh: 28,
    windDirection: "NW",
    humidity: 14,
    temperatureC: 36,
    aircraft: 4,
    engines: 22,
    personnel: 184,
    municipality: "Monchique",
    district: "Faro",
    parish: "Monchique",
    ipmaRisk: "maximum",
    description:
      "Active wildfire in the Serra de Monchique, originating near Foia. Strong NW winds driving the fire toward the southwest slope. Multiple communities under evacuation order. ANEPC has deployed significant aerial and ground resources. The fire started yesterday afternoon and has consumed approximately 1,240 hectares of eucalyptus and pine forest.",
    evacuationOrder: true,
    roadClosures: ["N267 (Monchique - Aljezur)", "M1067 (Caldas de Monchique)"],
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-03T14:22:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "First satellite detection",
        description: "VIIRS detected a thermal anomaly near Foia, Serra de Monchique. Confidence: high (0.85).",
        confidence: 0.85,
        verification: "single-source",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-03T14:35:00Z",
        sourceType: "community",
        sourceName: "Verified Local Reporter",
        type: "report",
        title: "Community smoke report",
        description: "Heavy smoke visible from Monchique town center, moving southwest. Reporter is a verified local resident.",
        confidence: 0.78,
        verification: "corroborated",
      },
      {
        id: "evt-3",
        timestamp: "2026-07-03T15:10:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "ANEPC confirms active fire",
        description: "ANEPC issues first official bulletin confirming active fire in Serra de Monchique. 8 engines and 2 aircraft deployed.",
        confidence: 0.95,
        verification: "officially-verified",
      },
      {
        id: "evt-4",
        timestamp: "2026-07-03T16:45:00Z",
        sourceType: "news",
        sourceName: "RTP Notícias",
        type: "article",
        title: "RTP reports evacuations beginning",
        description: "RTP Notícias reports preventive evacuations of Foia and surrounding hamlets. Link to full article.",
        confidence: 0.72,
        verification: "corroborated",
      },
      {
        id: "evt-5",
        timestamp: "2026-07-03T18:30:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "evacuation",
        title: "Evacuation order issued",
        description: "Formal evacuation order for Foia, Barranco de São Miguel, and eastern slope of Monchique. Shelter opened at Pavilhão de Monchique.",
        confidence: 1.0,
        verification: "officially-verified",
      },
      {
        id: "evt-6",
        timestamp: "2026-07-04T08:15:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS MODIS",
        type: "detection",
        title: "Morning overpass confirms expansion",
        description: "MODIS Terra overpass detects expanded fire perimeter. Estimated area now ~1,000 ha. Two distinct active fronts.",
        confidence: 0.88,
        verification: "corroborated",
      },
      {
        id: "evt-7",
        timestamp: "2026-07-04T13:50:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "deployment",
        title: "Resource surge",
        description: "ANEPC increases deployment: 4 aircraft (2 canadairs, 2 helicopters), 22 engines, 184 personnel. Fire still active on southwestern front.",
        confidence: 0.95,
        verification: "officially-verified",
      },
    ],
  },
  {
    id: "inc-estrela-2026",
    displayName: "Serra da Estrela Fire",
    status: "active",
    severity: "high",
    latitude: 40.3251,
    longitude: -7.4333,
    accuracyM: 1000,
    estimatedAreaHa: 580,
    firstDetected: "2026-07-04T02:14:00Z",
    lastUpdated: "2026-07-04T14:05:00Z",
    confidence: 0.81,
    verification: "corroborated",
    sourceCount: 4,
    sourceTypes: ["satellite", "official", "community"],
    windKmh: 18,
    windDirection: "SE",
    humidity: 22,
    temperatureC: 31,
    aircraft: 2,
    engines: 12,
    personnel: 86,
    municipality: "Seia",
    district: "Guarda",
    parish: "São Romão",
    ipmaRisk: "very_high",
    description:
      "Wildfire in the Serra da Estrela natural park, detected in the early hours of this morning. Originating near São Romão, the fire is burning in steep terrain with mixed pine and shrubland. SE winds are pushing the fire toward the northwest. No evacuation orders yet, but preventive alerts issued for nearby communities.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-04T02:14:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "Night overpass detection",
        description: "VIIRS Suomi NPP detected thermal anomaly near São Romão, Seia. Confidence: nominal (0.62).",
        confidence: 0.62,
        verification: "single-source",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-04T02:48:00Z",
        sourceType: "community",
        sourceName: "Registered User",
        type: "report",
        title: "Smoke sighting from Seia",
        description: "Smoke visible from Seia town, glowing red on the eastern ridge. Reported at 03:48 local time.",
        confidence: 0.55,
        verification: "unverified",
      },
      {
        id: "evt-3",
        timestamp: "2026-07-04T06:30:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "ANEPC confirms and deploys",
        description: "ANEPC confirms active fire. Initial deployment: 12 engines, 2 helicopters, 86 personnel.",
        confidence: 0.92,
        verification: "officially-verified",
      },
      {
        id: "evt-4",
        timestamp: "2026-07-04T14:05:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS MODIS",
        type: "detection",
        title: "Afternoon expansion",
        description: "MODIS Terra overpass shows expanded perimeter, ~580 ha. Fire moving northwest toward protected zone.",
        confidence: 0.85,
        verification: "corroborated",
      },
    ],
  },
  {
    id: "inc-pedrogao-2026",
    displayName: "Pedrógão Grande Fire",
    status: "contained",
    severity: "medium",
    latitude: 39.9167,
    longitude: -8.1833,
    accuracyM: 500,
    estimatedAreaHa: 320,
    firstDetected: "2026-07-03T11:00:00Z",
    lastUpdated: "2026-07-04T10:30:00Z",
    confidence: 0.94,
    verification: "officially-verified",
    sourceCount: 5,
    sourceTypes: ["satellite", "official", "community", "news"],
    windKmh: 12,
    windDirection: "N",
    humidity: 35,
    temperatureC: 28,
    aircraft: 0,
    engines: 8,
    personnel: 42,
    municipality: "Pedrógão Grande",
    district: "Leiria",
    parish: "Pedrógão Grande",
    ipmaRisk: "high",
    description:
      "Wildfire near Pedrógão Grande, contained as of this morning. The fire burned approximately 320 hectares of mixed forest. No casualties and no structures lost. ANEPC has scaled back aerial resources; ground crews continue mop-up operations.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-03T11:00:00Z",
        sourceType: "community",
        sourceName: "Verified Local Reporter",
        type: "report",
        title: "Initial smoke report",
        description: "Heavy smoke reported south of Pedrógão Grande. Reporter is a verified local forester.",
        confidence: 0.82,
        verification: "single-source",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-03T11:30:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "Satellite confirmation",
        description: "VIIRS confirms thermal anomaly matching community report.",
        confidence: 0.88,
        verification: "corroborated",
      },
      {
        id: "evt-3",
        timestamp: "2026-07-03T12:00:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "ANEPC confirms and deploys",
        description: "ANEPC deploys 8 engines and 2 helicopters. Fire actively spreading east.",
        confidence: 0.95,
        verification: "officially-verified",
      },
      {
        id: "evt-4",
        timestamp: "2026-07-04T10:30:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "Containment achieved",
        description: "ANEPC reports fire contained. Aerial resources released; ground crews conducting mop-up. Estimated area 320 ha.",
        confidence: 0.97,
        verification: "officially-verified",
      },
    ],
  },
  {
    id: "inc-geres-2026",
    displayName: "Peneda-Gerês Fire",
    status: "detected",
    severity: "low",
    latitude: 41.7281,
    longitude: -8.1567,
    accuracyM: 375,
    estimatedAreaHa: 45,
    firstDetected: "2026-07-04T13:18:00Z",
    lastUpdated: "2026-07-04T14:30:00Z",
    confidence: 0.61,
    verification: "single-source",
    sourceCount: 1,
    sourceTypes: ["satellite"],
    windKmh: 8,
    windDirection: "W",
    humidity: 48,
    temperatureC: 24,
    aircraft: 0,
    engines: 4,
    personnel: 18,
    municipality: "Terras de Bouro",
    district: "Braga",
    parish: "Vilar da Veiga",
    ipmaRisk: "moderate",
    description:
      "Newly detected thermal anomaly in the Peneda-Gerês National Park. Single satellite source; awaiting official confirmation. Initial assessment suggests small fire (under 50 ha). ANEPC has dispatched ground crew for verification.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-04T13:18:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "Initial satellite detection",
        description: "VIIRS detected thermal anomaly in Peneda-Gerês NP. Confidence: nominal (0.61). Small footprint suggests recent ignition.",
        confidence: 0.61,
        verification: "single-source",
      },
    ],
  },
  {
    id: "inc-algarve-2026",
    displayName: "Aljezur Fire",
    status: "active",
    severity: "high",
    latitude: 37.3167,
    longitude: -8.8000,
    accuracyM: 500,
    estimatedAreaHa: 215,
    firstDetected: "2026-07-04T07:45:00Z",
    lastUpdated: "2026-07-04T14:20:00Z",
    confidence: 0.86,
    verification: "corroborated",
    sourceCount: 3,
    sourceTypes: ["satellite", "official", "community"],
    windKmh: 22,
    windDirection: "NW",
    humidity: 18,
    temperatureC: 33,
    aircraft: 2,
    engines: 10,
    personnel: 64,
    municipality: "Aljezur",
    district: "Faro",
    parish: "Aljezur",
    ipmaRisk: "very_high",
    description:
      "Active wildfire near Aljezur, in the western Algarve. The fire is burning in coastal scrubland and pine forest. NW winds are pushing the fire toward the interior. No evacuation orders, but the IPMA risk level is Very High and the fire is in a sensitive ecological zone.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-04T07:45:00Z",
        sourceType: "community",
        sourceName: "Registered User",
        type: "report",
        title: "Smoke sighting from N120",
        description: "Smoke reported visible from N120 road near Aljezur. Reporter is a registered user.",
        confidence: 0.58,
        verification: "unverified",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-04T08:15:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "Satellite confirmation",
        description: "VIIRS confirms thermal anomaly matching community report. Confidence: high (0.84).",
        confidence: 0.84,
        verification: "corroborated",
      },
      {
        id: "evt-3",
        timestamp: "2026-07-04T09:30:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "ANEPC deploys",
        description: "ANEPC deploys 10 engines, 2 helicopters, 64 personnel. Fire actively spreading inland.",
        confidence: 0.92,
        verification: "officially-verified",
      },
    ],
  },
  {
    id: "inc-madeira-2026",
    displayName: "Madeira - Santana Fire",
    status: "monitoring",
    severity: "low",
    latitude: 32.7667,
    longitude: -16.8833,
    accuracyM: 500,
    estimatedAreaHa: 28,
    firstDetected: "2026-07-03T19:00:00Z",
    lastUpdated: "2026-07-04T11:00:00Z",
    confidence: 0.78,
    verification: "officially-verified",
    sourceCount: 2,
    sourceTypes: ["satellite", "official"],
    windKmh: 15,
    windDirection: "NE",
    humidity: 42,
    temperatureC: 26,
    aircraft: 0,
    engines: 2,
    personnel: 12,
    municipality: "Santana",
    district: "Madeira",
    parish: "Santana",
    ipmaRisk: "moderate",
    description:
      "Small fire on the north coast of Madeira, near Santana. The fire has been contained and the situation is being monitored for rekindle. Local ground crews remain on scene. The IPMA risk level is Moderate.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-03T19:00:00Z",
        sourceType: "satellite",
        sourceName: "NASA FIRMS VIIRS",
        type: "detection",
        title: "Initial detection",
        description: "VIIRS detects thermal anomaly near Santana, Madeira.",
        confidence: 0.7,
        verification: "single-source",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-03T19:45:00Z",
        sourceType: "official",
        sourceName: "ANEPC Madeira",
        type: "status_change",
        title: "Containment",
        description: "Local civil protection reports fire contained. Ground crews monitoring.",
        confidence: 0.92,
        verification: "officially-verified",
      },
    ],
  },
  {
    id: "inc-setubal-2026",
    displayName: "Serra da Arrábida Fire",
    status: "resolved",
    severity: "low",
    latitude: 38.5167,
    longitude: -8.9833,
    accuracyM: 375,
    estimatedAreaHa: 18,
    firstDetected: "2026-07-02T15:30:00Z",
    lastUpdated: "2026-07-03T22:00:00Z",
    confidence: 0.93,
    verification: "officially-verified",
    sourceCount: 3,
    sourceTypes: ["satellite", "official", "community"],
    windKmh: 10,
    windDirection: "N",
    humidity: 55,
    temperatureC: 25,
    aircraft: 0,
    engines: 0,
    personnel: 0,
    municipality: "Setúbal",
    district: "Setúbal",
    parish: "São Sebastião",
    ipmaRisk: "moderate",
    description:
      "Resolved small fire in the Serra da Arrábida natural park. The fire burned approximately 18 hectares of scrubland before being fully extinguished. No structures were threatened. All resources have been released.",
    timeline: [
      {
        id: "evt-1",
        timestamp: "2026-07-02T15:30:00Z",
        sourceType: "community",
        sourceName: "Verified Local Reporter",
        type: "report",
        title: "Initial report",
        description: "Smoke reported in Serra da Arrábida. Reporter is a verified hiker.",
        confidence: 0.75,
        verification: "single-source",
      },
      {
        id: "evt-2",
        timestamp: "2026-07-02T16:00:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "Deployment",
        description: "ANEPC deploys 4 engines. Fire in scrubland, no structures threatened.",
        confidence: 0.92,
        verification: "officially-verified",
      },
      {
        id: "evt-3",
        timestamp: "2026-07-03T22:00:00Z",
        sourceType: "official",
        sourceName: "ANEPC",
        type: "status_change",
        title: "Resolved",
        description: "ANEPC declares fire resolved. All resources released.",
        confidence: 0.97,
        verification: "officially-verified",
      },
    ],
  },
];

// === Playback frames for the T-24h timeline scrubber ===
// Each frame describes what should be visible at that hour offset
export const PLAYBACK_FRAMES: PlaybackFrame[] = [
  {
    hourOffset: -24,
    activeIncidentIds: [],
    highlights: [],
  },
  {
    hourOffset: -22,
    activeIncidentIds: [],
    highlights: [{ incidentId: "inc-setubal-2026", note: "Arrábida fire starts" }],
  },
  {
    hourOffset: -18,
    activeIncidentIds: ["inc-setubal-2026"],
    highlights: [],
  },
  {
    hourOffset: -12,
    activeIncidentIds: ["inc-setubal-2026", "inc-pedrogao-2026"],
    highlights: [{ incidentId: "inc-pedrogao-2026", note: "Pedrógão fire detected" }],
  },
  {
    hourOffset: -10,
    activeIncidentIds: ["inc-setubal-2026", "inc-pedrogao-2026", "inc-monchique-2026"],
    highlights: [{ incidentId: "inc-monchique-2026", note: "Monchique fire detected" }],
  },
  {
    hourOffset: -8,
    activeIncidentIds: ["inc-pedrogao-2026", "inc-monchique-2026"],
    highlights: [{ incidentId: "inc-setubal-2026", note: "Arrábida resolved" }],
  },
  {
    hourOffset: -5,
    activeIncidentIds: ["inc-pedrogao-2026", "inc-monchique-2026", "inc-madeira-2026"],
    highlights: [{ incidentId: "inc-madeira-2026", note: "Madeira fire detected" }],
  },
  {
    hourOffset: -2,
    activeIncidentIds: ["inc-pedrogao-2026", "inc-monchique-2026", "inc-madeira-2026", "inc-algarve-2026"],
    highlights: [{ incidentId: "inc-algarve-2026", note: "Aljezur fire detected" }],
  },
  {
    hourOffset: -1,
    activeIncidentIds: ["inc-monchique-2026", "inc-madeira-2026", "inc-algarve-2026", "inc-estrela-2026"],
    highlights: [
      { incidentId: "inc-pedrogao-2026", note: "Pedrógão contained" },
      { incidentId: "inc-estrela-2026", note: "Estrela detected overnight" },
    ],
  },
  {
    hourOffset: 0,
    activeIncidentIds: [
      "inc-monchique-2026",
      "inc-madeira-2026",
      "inc-algarve-2026",
      "inc-estrela-2026",
      "inc-geres-2026",
    ],
    highlights: [
      { incidentId: "inc-geres-2026", note: "Gerês detected 30 min ago" },
    ],
  },
];

// === Follow state (mock) ===
// In a real implementation this would be server-side; here we simulate per-session
export const FOLLOWED_AREAS_MOCK = [
  { id: "area-monchique", name: "Monchique", type: "municipality" as const },
  { id: "area-lisboa", name: "Lisboa", type: "municipality" as const },
];

export const NOTIFICATIONS_MOCK = [
  {
    id: "notif-1",
    incidentId: "inc-monchique-2026",
    title: "Critical: Evacuation order — Monchique",
    body: "Formal evacuation order issued for Foia and surrounding hamlets. Shelter opened at Pavilhão de Monchique.",
    timestamp: "2026-07-03T18:30:00Z",
    priority: "critical" as const,
    read: false,
  },
  {
    id: "notif-2",
    incidentId: "inc-estrela-2026",
    title: "New fire detected — Serra da Estrela",
    body: "Newly detected fire near São Romão, Seia. ANEPC has confirmed and deployed resources.",
    timestamp: "2026-07-04T06:30:00Z",
    priority: "standard" as const,
    read: false,
  },
  {
    id: "notif-3",
    incidentId: "inc-pedrogao-2026",
    title: "Containment — Pedrógão Grande",
    body: "ANEPC reports the Pedrógão Grande fire is contained. Aerial resources released; ground crews continuing mop-up.",
    timestamp: "2026-07-04T10:30:00Z",
    priority: "informational" as const,
    read: true,
  },
  {
    id: "notif-4",
    incidentId: "inc-geres-2026",
    title: "New satellite detection — Peneda-Gerês",
    body: "Single satellite source detected a thermal anomaly in Peneda-Gerês National Park. Awaiting official confirmation.",
    timestamp: "2026-07-04T13:18:00Z",
    priority: "informational" as const,
    read: false,
  },
];
