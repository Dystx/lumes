import { describe, expect, it } from "vitest";
import { countIncidentStates, presentIncident } from "@/lib/incident-presentation";
import { reconcilePriorityIncidents } from "@/lib/incident";
import type { LiveIncident } from "@/lib/types";

function incident(overrides: Partial<LiveIncident> = {}): LiveIncident {
  return {
    id: "anepc-1",
    sourceId: "anepc-prociv-arcgis",
    sourceInternalId: "1",
    observedAt: "2026-07-11T10:00:00.000Z",
    ingestedAt: "2026-07-11T10:01:00.000Z",
    geometry: { type: "Point", coordinates: [-8.6, 41.1] },
    sourceType: "official",
    properties: {
      localidade: "---",
      municipality: "Viseu",
      parish: "São João",
      region: "Centro",
    },
    trust: {
      confidence: 0.9,
      sourceReputation: 0.95,
      verificationStatus: "officially-verified",
      corroborationCount: 0,
      freshnessScore: 1,
    },
    eventType: "wildfire",
    incidentStatus: "active",
    severity: "high",
    displayName: "--- (Viseu)",
    estimatedAreaHa: 0,
    firstDetected: "2026-07-11T10:00:00.000Z",
    lastUpdated: "2026-07-11T10:01:00.000Z",
    ...overrides,
  };
}

describe("incident presentation", () => {
  it("falls back from sentinel or blank localities to municipality, district, then a localized title", () => {
    expect(presentIncident(incident(), "pt")).toMatchObject({ title: "Viseu", location: "São João, Viseu" });
    expect(presentIncident(incident({ properties: { ...incident().properties, localidade: "   ", municipality: "", region: "Norte" } }), "pt")).toMatchObject({ title: "Norte" });
    expect(presentIncident(incident({ properties: { ...incident().properties, localidade: "", municipality: "", region: "" } }), "en")).toMatchObject({ title: "Unnamed incident" });
  });

  it("maps state labels to citizen-facing groups", () => {
    expect(presentIncident(incident({ incidentStatus: "contained" }), "pt").stateGroup).toBe("contained");
    expect(presentIncident(incident({ incidentStatus: "resolved" }), "en").stateGroup).toBe("resolved");
    expect(presentIncident(incident({ incidentStatus: "monitoring" }), "en").stateGroup).toBe("active");
  });

  it("keeps visible, active, contained, and resolved counts independent", () => {
    expect(countIncidentStates([
      incident({ incidentStatus: "active" }),
      incident({ id: "2", incidentStatus: "detected" }),
      incident({ id: "3", incidentStatus: "contained" }),
      incident({ id: "4", incidentStatus: "resolved" }),
    ])).toEqual({ visible: 4, active: 2, contained: 1, resolved: 1 });
  });

  it("drops stale dashboard priority IDs and fills from visible incidents", () => {
    const visible = [
      incident({ id: "live-1", severity: "high", estimatedAreaHa: 2 }),
      incident({ id: "live-2", severity: "critical", estimatedAreaHa: 1 }),
      incident({ id: "live-3", severity: "medium", estimatedAreaHa: 0 }),
    ];

    expect(reconcilePriorityIncidents(["stale-db-id", "live-1"], visible, 3).map((item) => item.id))
      .toEqual(["live-1", "live-2", "live-3"]);
  });
});
