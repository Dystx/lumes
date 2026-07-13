import type { LiveIncidentResponse } from "../../../src/lib/incident-client";

const observedAt = "2026-07-13T10:00:00.000Z";

/** Stable, provider-independent incident used only by interaction tests. */
export const RESPONSIVE_INCIDENTS_FIXTURE: LiveIncidentResponse = {
  source: "responsive-fixture",
  sourceType: "official",
  fetchedAt: observedAt,
  totalRaw: 1,
  count: 1,
  incidents: [{
    id: "fixture-monchique-1",
    sourceId: "responsive-fixture",
    sourceInternalId: "rf-1",
    observedAt,
    ingestedAt: observedAt,
    firstDetected: observedAt,
    lastUpdated: observedAt,
    geometry: { type: "Point", coordinates: [-8.5574, 37.3147] },
    sourceType: "official",
    eventType: "wildfire",
    incidentStatus: "active",
    severity: "critical",
    displayName: "Incêndio de Monchique",
    estimatedAreaHa: 12,
    properties: {
      municipality: "Monchique",
      parish: "Monchique",
      region: "Faro",
      statusText: "Ativo",
    },
    trust: {
      confidence: 0.95,
      sourceReputation: 1,
      freshnessScore: 1,
      corroborationCount: 1,
      verificationStatus: "officially-verified",
    },
  }],
  distribution: {
    byType: { wildfire: 1 },
    byStatus: { active: 1 },
  },
  cached: false,
  latencyMs: 1,
};
