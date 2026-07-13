import { describe, expect, it } from "vitest";
import {
  normalizeHealthResponse,
  normalizeSourceHealthResponse,
  normalizeStatsResponse,
  type HealthResponse,
  type StatsResponse,
} from "@/lib/status-page-data";

const fallbackHealth: HealthResponse = {
  status: "degraded",
  timestamp: "2026-07-12T00:00:00.000Z",
  uptime_s: 0,
  latencyMs: 0,
  checks: {},
  lastIncidentUpdate: null,
};

const fallbackStats: StatsResponse = {
  total: 12,
  active: 3,
  resolved: 9,
  snapshots: 4,
};

describe("status-page response normalizers", () => {
  it("preserves valid health fields and recognized checks", () => {
    expect(normalizeHealthResponse({
      status: "ok",
      timestamp: "2026-07-12T10:00:00.000Z",
      uptime_s: 42,
      latencyMs: 7,
      checks: { database: "ok", ingest: "skip", ignored: "unknown" },
      lastIncidentUpdate: "2026-07-12T09:59:00.000Z",
    }, fallbackHealth)).toEqual({
      status: "ok",
      timestamp: "2026-07-12T10:00:00.000Z",
      uptime_s: 42,
      latencyMs: 7,
      checks: { database: "ok", ingest: "skip" },
      lastIncidentUpdate: "2026-07-12T09:59:00.000Z",
    });
  });

  it("degrades malformed health values without throwing", () => {
    expect(normalizeHealthResponse({
      status: "unknown",
      timestamp: 42,
      uptime_s: -1,
      latencyMs: "slow",
      checks: { database: "invalid" },
      lastIncidentUpdate: 42,
    }, fallbackHealth)).toEqual(fallbackHealth);
  });

  it("degrades a nominally healthy envelope when required fields are malformed", () => {
    expect(normalizeHealthResponse({
      status: "ok",
      timestamp: "not-a-date",
      uptime_s: "10",
      latencyMs: 2,
      checks: { database: "unknown" },
      lastIncidentUpdate: "also-not-a-date",
    }, fallbackHealth)).toEqual(fallbackHealth);
  });

  it("clamps invalid statistics while preserving safe fallback values", () => {
    expect(normalizeStatsResponse({
      total: -2,
      active: "bad",
      resolved: 4.8,
      snapshots: null,
    }, fallbackStats)).toEqual({
      total: 0,
      active: 3,
      resolved: 4,
      snapshots: 4,
    });
  });

  it("keeps valid disabled sources and nullable latency without inventing zeros", () => {
    expect(normalizeSourceHealthResponse({
      sources: [
        {
          sourceId: "aerial-adsb",
          sourceName: "Aerial activity",
          status: "disabled",
          lastSuccess: null,
          lastError: "Loaded on demand",
          recordCount: 0,
          latencyMs: null,
        },
        {
          sourceId: "bad-status",
          sourceName: "Unknown",
          status: "unexpected",
          lastSuccess: "not-a-date",
          lastError: null,
          recordCount: -3,
          latencyMs: -1,
        },
        { sourceId: "missing-latency", sourceName: "Missing latency" },
        { sourceId: "", sourceName: "Missing id" },
        "malformed",
      ],
    })).toEqual({
      sources: [
        {
          sourceId: "aerial-adsb",
          sourceName: "Aerial activity",
          status: "disabled",
          lastSuccess: null,
          lastError: "Loaded on demand",
          recordCount: 0,
          latencyMs: null,
        },
        {
          sourceId: "bad-status",
          sourceName: "Unknown",
          status: "error",
          lastSuccess: null,
          lastError: null,
          recordCount: 0,
          latencyMs: null,
        },
        {
          sourceId: "missing-latency",
          sourceName: "Missing latency",
          status: "error",
          lastSuccess: null,
          lastError: null,
          recordCount: 0,
          latencyMs: null,
        },
      ],
    });
  });

  it("returns an empty source envelope for malformed source payloads", () => {
    expect(normalizeSourceHealthResponse({ sources: "not-an-array" })).toEqual({ sources: [] });
    expect(normalizeSourceHealthResponse(null)).toEqual({ sources: [] });
  });
});
