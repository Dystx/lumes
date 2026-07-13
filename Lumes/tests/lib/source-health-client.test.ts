import { describe, expect, it } from "vitest";
import {
  normalizeSourceHealthResponse,
  transformSourceHealthResponse,
} from "@/lib/source-health-client";

const fetchedAt = "2026-07-13T10:00:00Z";
const source = {
  sourceId: "ipma-weather",
  sourceName: "IPMA Weather",
  status: "ok",
  tier: "core",
  state: "healthy",
  dataState: "healthy",
  lastSuccess: fetchedAt,
  lastError: null,
  recordCount: 1,
  latencyMs: 120,
  sourceUpdatedAt: fetchedAt,
  receivedAt: fetchedAt,
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    sources: [source],
    fetchedAt,
    cached: false,
    dataState: { state: "healthy", updatedAt: fetchedAt, source: "core" },
    ...overrides,
  };
}

describe("source health client boundary", () => {
  it("accepts a healthy source list and optional timestamps", () => {
    expect(normalizeSourceHealthResponse(response())).toMatchObject({ sources: [source] });
  });

  it("preserves explicit empty source health", () => {
    expect(normalizeSourceHealthResponse(response({
      sources: [],
      dataState: { state: "empty", updatedAt: fetchedAt, source: "core" },
    }))).toMatchObject({ sources: [] });
  });

  it("rejects malformed envelope and trust metadata", () => {
    expect(normalizeSourceHealthResponse({ sources: [] })).toBeNull();
    expect(normalizeSourceHealthResponse(response({ fetchedAt: "not-a-date" }))).toBeNull();
    expect(normalizeSourceHealthResponse(response({ cached: "false" }))).toBeNull();
    expect(normalizeSourceHealthResponse(response({ dataState: { state: "unknown", updatedAt: fetchedAt } }))).toBeNull();
  });

  it("keeps valid mixed sources when malformed rows are not counted", () => {
    expect(normalizeSourceHealthResponse(response({ sources: [source, { sourceId: "bad" }] }))).toMatchObject({ sources: [source] });
  });

  it("rejects invalid rows, duplicate IDs, and impossible metrics", () => {
    expect(normalizeSourceHealthResponse(response({ sources: [{ ...source, status: "unknown" }] }))).toBeNull();
    expect(normalizeSourceHealthResponse(response({ sources: [source, source] }))).toBeNull();
    expect(normalizeSourceHealthResponse(response({ sources: [{ ...source, recordCount: -1 }] }))).toBeNull();
    expect(normalizeSourceHealthResponse(response({ sources: [{ ...source, latencyMs: -1 }] }))).toBeNull();
  });

  it("throws a stable error for malformed successful payloads", () => {
    expect(() => transformSourceHealthResponse({})).toThrow("Invalid source health response envelope");
  });
});
