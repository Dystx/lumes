import { describe, expect, it } from "vitest";
import { normalizeFireRiskResponse, transformFireRiskResponse } from "@/lib/fire-risk-client";

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dico: "1106",
    latitude: 38.72,
    longitude: -9.14,
    rcm: 3,
    dataPrev: "2026-07-13",
    ...overrides,
  };
}

function validResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "ipma",
    fetchedAt: "2026-07-13T10:01:00.000Z",
    dataPrev: "2026-07-13",
    dataRun: "2026-07-13T00:00:00Z",
    count: 1,
    distribution: { 3: 1 },
    records: [validRecord()],
    riskLabels: ["", "Reduced", "Moderate", "High", "Very High", "Maximum"],
    cached: false,
    dataState: {
      state: "healthy",
      updatedAt: "2026-07-13T10:01:00.000Z",
      sourceUpdatedAt: "2026-07-13T10:01:00.000Z",
      source: "ipma",
    },
    ...overrides,
  };
}

describe("client fire-risk boundary", () => {
  it("normalizes a valid IPMA risk envelope and distribution", () => {
    expect(normalizeFireRiskResponse(validResponse())).toMatchObject({
      source: "ipma",
      count: 1,
      records: [{ dico: "1106", rcm: 3 }],
      distribution: { 3: 1 },
      riskLabels: ["", "Reduced", "Moderate", "High", "Very High", "Maximum"],
      dataState: { state: "healthy", sourceUpdatedAt: "2026-07-13T10:01:00.000Z" },
    });
  });

  it("preserves an explicit empty risk state", () => {
    expect(normalizeFireRiskResponse(validResponse({
      dataPrev: "",
      dataRun: "",
      count: 0,
      distribution: {},
      records: [],
      dataState: {
        state: "empty",
        updatedAt: "2026-07-13T10:01:00.000Z",
        source: "ipma",
      },
    }))).toMatchObject({ count: 0, records: [], distribution: {}, dataState: { state: "empty" } });
  });

  it("retains valid records from a mixed payload when count and distribution match", () => {
    expect(normalizeFireRiskResponse(validResponse({
      count: 1,
      distribution: { 3: 1 },
      records: [validRecord(), validRecord({ dico: "bad", latitude: 0 })],
    }))?.records.map((record) => record.dico)).toEqual(["1106"]);
  });

  it.each([
    ["invalid source", { source: "risk-provider" }],
    ["invalid fetched timestamp", { fetchedAt: "not-a-date" }],
    ["invalid coordinate", { records: [validRecord({ longitude: 0 })] }],
    ["invalid risk level", { records: [validRecord({ rcm: 6 })] }],
    ["count mismatch", { count: 2, distribution: { 3: 2 } }],
    ["distribution mismatch", { distribution: { 3: 2 } }],
    ["invalid labels", { riskLabels: ["ok", 1] }],
    ["invalid metadata", { dataState: { state: "healthy", updatedAt: "not-a-date" } }],
    ["invalid cached flag", { cached: "false" }],
  ])("rejects envelopes with %s", (_label, overrides) => {
    expect(normalizeFireRiskResponse(validResponse(overrides))).toBeNull();
  });

  it("rejects duplicate municipality codes and all-invalid non-empty rows", () => {
    expect(normalizeFireRiskResponse(validResponse({
      count: 2,
      distribution: { 3: 2 },
      records: [validRecord(), validRecord()],
    }))).toBeNull();

    const response = validResponse({
      count: 0,
      distribution: {},
      records: [validRecord({ rcm: "high" })],
    });
    expect(normalizeFireRiskResponse(response)).toBeNull();
    expect(() => transformFireRiskResponse(response)).toThrow("Invalid fire-risk response envelope");
  });
});
