import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  persistIncidents,
  getPersistedIncidents,
  getIncidentTimeline,
  getPersistenceStats,
} from "@/lib/persistence";
import type { LiveIncident } from "@/lib/types";

const mkLiveIncident = (id: string, status: LiveIncident["incidentStatus"]): LiveIncident => ({
  id,
  sourceId: "test",
  sourceInternalId: id,
  observedAt: new Date().toISOString(),
  ingestedAt: new Date().toISOString(),
  geometry: { type: "Point", coordinates: [-9.1, 38.7] },
  sourceType: "official",
  properties: {
    statusCode: 0,
    statusText: "Test",
    statusGroup: "Test",
    rasi: "Florestais",
    naturezaText: "Incêndio",
    locality: "Test",
    personnelTotal: 5,
    assetsGround: 1,
    assetsAerial: 0,
    municipality: "Lisboa",
    parish: "—",
    region: "Lisboa",
  },
  trust: {
    confidence: 0.9,
    sourceReputation: 1,
    verificationStatus: "officially-verified",
    corroborationCount: 0,
    freshnessScore: 1,
  },
  eventType: "wildfire",
  incidentStatus: status,
  severity: "medium",
  displayName: `Test Incident ${id}`,
  estimatedAreaHa: 0,
  firstDetected: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
});

describe("persistence", () => {
  beforeEach(async () => {
    // Clean slate per test
    await db.incidentSnapshot.deleteMany({});
    await db.incident.deleteMany({});
  });

  it("creates new incidents with an initial snapshot", async () => {
    const result = await persistIncidents([mkLiveIncident("test-1", "active")]);
    expect(result.created).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.snapshotsCreated).toBe(1);
    expect(result.errors).toHaveLength(0);

    const found = await db.incident.findUnique({ where: { id: "test-1" } });
    expect(found).not.toBeNull();
    expect(found?.status).toBe("active");

    const snapshots = await getIncidentTimeline("test-1");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].note).toBe("Incident first detected");
  });

  it("updates without producing a new snapshot when state is unchanged", async () => {
    await persistIncidents([mkLiveIncident("test-2", "active")]);
    const result = await persistIncidents([mkLiveIncident("test-2", "active")]);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.snapshotsCreated).toBe(0); // same state → no new snapshot
  });

  it("creates a new snapshot when state changes", async () => {
    await persistIncidents([mkLiveIncident("test-3", "active")]);
    await persistIncidents([mkLiveIncident("test-3", "contained")]);
    const snapshots = await getIncidentTimeline("test-3");
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].status).toBe("contained");
  });

  it("filters persisted incidents by status", async () => {
    await persistIncidents([
      mkLiveIncident("a", "active"),
      mkLiveIncident("b", "resolved"),
      mkLiveIncident("c", "active"),
    ]);
    const active = await getPersistedIncidents({ status: "active" });
    expect(active).toHaveLength(2);
    expect(active.every((i) => i.status === "active")).toBe(true);
  });

  it("returns aggregate stats", async () => {
    await persistIncidents([
      mkLiveIncident("s1", "active"),
      mkLiveIncident("s2", "active"),
      mkLiveIncident("s3", "resolved"),
    ]);
    const stats = await getPersistenceStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.resolved).toBe(1);
    expect(stats.snapshots).toBeGreaterThanOrEqual(3);
  });
});
