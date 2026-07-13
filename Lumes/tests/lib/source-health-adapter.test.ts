import { describe, expect, it } from "vitest";
import {
  headlineTrustToDataState,
  sourceHealthToTrust,
} from "@/lib/source-health-adapter";
import type { SourceHealth } from "@/lib/types";

const sourceHealth = (overrides: Partial<SourceHealth> = {}): SourceHealth => ({
  sourceId: "ipma-weather",
  sourceName: "IPMA weather",
  status: "ok",
  lastSuccess: "2026-07-12T10:00:00.000Z",
  lastError: null,
  recordCount: 12,
  latencyMs: 20,
  sourceUpdatedAt: "2026-07-12T09:59:00.000Z",
  receivedAt: "2026-07-12T10:00:00.000Z",
  ...overrides,
});

describe("source-health adapter", () => {
  it("normalizes a healthy core source without losing timestamps", () => {
    expect(sourceHealthToTrust(sourceHealth())).toEqual({
      sourceId: "ipma-weather",
      tier: "core",
      state: "healthy",
      reason: null,
      sourceUpdatedAt: "2026-07-12T09:59:00.000Z",
    });
  });

  it("prefers the explicit state and preserves optional-source failures", () => {
    expect(sourceHealthToTrust(sourceHealth({
      sourceId: "nasa-firms-viirs",
      status: "ok",
      state: "error",
      lastError: "provider unavailable",
      sourceUpdatedAt: null,
    }))).toEqual({
      sourceId: "nasa-firms-viirs",
      tier: "optional",
      state: "error",
      reason: "provider unavailable",
      sourceUpdatedAt: null,
    });
  });

  it("maps headline trust states to public data states", () => {
    expect(headlineTrustToDataState("fresh")).toBe("healthy");
    expect(headlineTrustToDataState("updating")).toBe("healthy");
    expect(headlineTrustToDataState("error")).toBe("retryable-error");
    expect(headlineTrustToDataState("stale")).toBe("stale");
    expect(headlineTrustToDataState("fallback")).toBe("fallback");
    expect(headlineTrustToDataState("empty")).toBe("empty");
  });
});
