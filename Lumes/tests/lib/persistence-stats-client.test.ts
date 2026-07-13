import { describe, expect, it } from "vitest";
import { normalizePersistenceStatsResponse, transformPersistenceStatsResponse } from "@/lib/persistence-stats-client";

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    total: 120,
    active: 8,
    resolved: 112,
    snapshots: 480,
    fetchedAt: "2026-07-13T10:01:00.000Z",
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      source: "persistence",
    },
    ...overrides,
  };
}

describe("client persistence-stats boundary", () => {
  it("normalizes a valid persistence stats envelope", () => {
    expect(normalizePersistenceStatsResponse(validResponse())).toMatchObject({
      total: 120,
      active: 8,
      resolved: 112,
      snapshots: 480,
      dataState: { state: "healthy", source: "persistence" },
    });
  });

  it("preserves explicit empty stats", () => {
    expect(normalizePersistenceStatsResponse(validResponse({
      total: 0,
      active: 0,
      resolved: 0,
      snapshots: 0,
      dataState: { state: "empty", updatedAt: "2026-07-13T10:01:00.000Z", source: "persistence" },
    }))).toMatchObject({ total: 0, active: 0, resolved: 0, snapshots: 0, dataState: { state: "empty" } });
  });

  it.each([
    ["invalid total", { total: -1 }],
    ["fractional active", { active: 1.5 }],
    ["resolved exceeds total", { resolved: 121 }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
    ["empty state with rows", { dataState: { state: "empty", updatedAt: "2026-07-13T10:01:00.000Z" } }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizePersistenceStatsResponse(validResponse(overrides))).toBeNull();
  });

  it("fails closed through the stable transform", () => {
    const response = validResponse({ total: "120" });
    expect(normalizePersistenceStatsResponse(response)).toBeNull();
    expect(() => transformPersistenceStatsResponse(response)).toThrow("Invalid persistence stats response envelope");
  });
});
