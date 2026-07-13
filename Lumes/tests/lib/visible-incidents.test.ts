import { describe, expect, it } from "vitest";
import type { Incident, PlaybackFrame } from "@/lib/sample-data";
import type { IncidentFilterState } from "@/lib/incident-filters";
import { deriveVisibleIncidents } from "@/lib/visible-incidents";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");

const baseFilters: IncidentFilterState = {
  severities: new Set(["critical", "high", "medium", "low"]),
  hideResolved: true,
  quick: "all",
  phase: null,
  resource: null,
  search: "",
};

function incident(
  id: string,
  firstDetected: string,
  severity: Incident["severity"] = "high",
): Incident {
  return {
    id,
    displayName: id,
    status: "active",
    severity,
    latitude: 39,
    longitude: -8,
    accuracyM: 100,
    estimatedAreaHa: 1,
    firstDetected,
    lastUpdated: firstDetected,
    confidence: 1,
    verification: "officially-verified",
    sourceCount: 1,
    sourceTypes: ["official"],
    windKmh: 1,
    windDirection: "N",
    humidity: 50,
    temperatureC: 25,
    aircraft: 0,
    engines: 1,
    personnel: 1,
    municipality: "Lisboa",
    district: "Lisboa",
    parish: "Lisboa",
    ipmaRisk: "high",
    timeline: [],
    description: "",
  };
}

const liveIncidents = [
  incident("recent", "2026-07-12T10:00:00.000Z"),
  incident("old", "2026-07-12T05:00:00.000Z"),
];

const playbackFrames: PlaybackFrame[] = [
  { hourOffset: -24, activeIncidentIds: ["sample-a"], highlights: [] },
  { hourOffset: -12, activeIncidentIds: ["sample-b"], highlights: [] },
];

describe("deriveVisibleIncidents", () => {
  it("applies the playback cutoff before incident filters", () => {
    expect(deriveVisibleIncidents({
      incidents: liveIncidents,
      playbackHour: -3,
      filters: baseFilters,
      sampleIncidents: [],
      playbackFrames,
      nowMs: NOW,
    }).map((item) => item.id)).toEqual(["old"]);

    const observedOnly = {
      ...incident("observed-only", ""),
      observedAt: "2026-07-12T05:00:00.000Z",
    };
    expect(deriveVisibleIncidents({
      incidents: [observedOnly],
      playbackHour: -3,
      filters: baseFilters,
      sampleIncidents: [],
      playbackFrames,
      nowMs: NOW,
    }).map((item) => item.id)).toEqual(["observed-only"]);
  });

  it("uses the live collection directly in the normal view", () => {
    expect(deriveVisibleIncidents({
      incidents: liveIncidents,
      playbackHour: 0,
      filters: { ...baseFilters, severities: new Set(["critical"]) },
      sampleIncidents: [],
      playbackFrames,
      nowMs: NOW,
    })).toEqual([]);
  });

  it("selects the nearest sample frame when live playback data is empty", () => {
    const samples = [
      incident("sample-a", "2026-07-12T00:00:00.000Z"),
      incident("sample-b", "2026-07-12T01:00:00.000Z", "critical"),
    ];

    expect(deriveVisibleIncidents({
      incidents: [],
      playbackHour: -13,
      filters: baseFilters,
      sampleIncidents: samples,
      playbackFrames,
      nowMs: NOW,
    }).map((item) => item.id)).toEqual(["sample-b"]);
  });

  it("keeps the first frame on an exact nearest-frame tie and filters its pool", () => {
    const samples = [incident("sample-a", "2026-07-12T00:00:00.000Z")];
    const result = deriveVisibleIncidents({
      incidents: [],
      playbackHour: -18,
      filters: { ...baseFilters, severities: new Set(["critical"]) },
      sampleIncidents: samples,
      playbackFrames,
      nowMs: NOW,
    });

    expect(result).toEqual([]);

    expect(deriveVisibleIncidents({
      incidents: [],
      playbackHour: -18,
      filters: baseFilters,
      sampleIncidents: samples,
      playbackFrames: [],
      nowMs: NOW,
    })).toEqual([]);
  });
});
