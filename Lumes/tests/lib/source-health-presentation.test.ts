import { describe, expect, it } from "vitest";
import type { DataStateMeta } from "@/lib/data-state";
import type { DataTrustState } from "@/lib/data-trust";
import type { SourceHealth } from "@/lib/types";
import { buildSourceHealthPresentation } from "@/lib/source-health-presentation";

const trust = (
  state: DataTrustState["state"],
  reason: string | null = null,
): DataTrustState => ({
  state,
  source: "core",
  sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
  observedAt: "2026-07-12T10:00:00.000Z",
  reason,
});

const source = (overrides: Partial<SourceHealth> = {}): SourceHealth => ({
  sourceId: "ipma-weather",
  sourceName: "IPMA weather",
  status: "ok",
  tier: "core",
  state: "healthy",
  lastSuccess: "2026-07-12T10:00:00.000Z",
  lastError: null,
  recordCount: 1,
  latencyMs: 10,
  sourceUpdatedAt: "2026-07-12T10:00:00.000Z",
  receivedAt: "2026-07-12T10:00:00.000Z",
  ...overrides,
});

const dataState = (
  state: DataStateMeta["state"],
  reason?: string,
): DataStateMeta => ({
  state,
  updatedAt: "2026-07-12T10:00:00.000Z",
  ...(reason ? { reason } : {}),
});

const input = (overrides: Partial<Parameters<typeof buildSourceHealthPresentation>[0]> = {}) => ({
  sources: [source()],
  headlineTrust: trust("fresh"),
  liveTrust: trust("fresh"),
  sourceDataState: null,
  sourceError: null,
  lang: "en" as const,
  ...overrides,
});

describe("source-health presentation", () => {
  it("keeps optional failures out of headline trust and labels them", () => {
    expect(buildSourceHealthPresentation(input({
      sources: [
        source({ sourceId: "nasa-firms-viirs", tier: "optional", state: "error" }),
        source({ sourceId: "aerial-adsb", tier: "optional", state: "disabled" }),
      ],
      lang: "pt",
    }))).toEqual({
      state: "healthy",
      reason: undefined,
      optionalLayerWarning: "Camada opcional indisponível: nasa-firms-viirs, aerial-adsb",
    });
  });

  it("lets live fallback or stale state take precedence", () => {
    expect(buildSourceHealthPresentation(input({ liveTrust: trust("fallback") })).state).toBe("fallback");
    expect(buildSourceHealthPresentation(input({ liveTrust: trust("stale") })).state).toBe("stale");
  });

  it("uses source metadata and error state when no source rows exist", () => {
    expect(buildSourceHealthPresentation(input({
      sources: [],
      sourceDataState: dataState("stale"),
    })).state).toBe("stale");
    expect(buildSourceHealthPresentation(input({
      sources: [],
      sourceDataState: dataState("retryable-error"),
    })).state).toBe("retryable-error");
  });

  it("preserves reason precedence and localized source-health errors", () => {
    expect(buildSourceHealthPresentation(input({
      liveTrust: trust("stale", "live stale"),
      headlineTrust: trust("fresh", "headline reason"),
      sourceDataState: dataState("stale", "metadata reason"),
      sourceError: "provider error",
    })).reason).toBe("live stale");

    expect(buildSourceHealthPresentation(input({
      headlineTrust: trust("fresh", "headline reason"),
      sourceDataState: dataState("stale", "metadata reason"),
      sourceError: "provider error",
    })).reason).toBe("headline reason");

    expect(buildSourceHealthPresentation(input({
      headlineTrust: trust("fresh"),
      sourceDataState: dataState("stale", "metadata reason"),
      sourceError: "provider error",
    })).reason).toBe("metadata reason");

    expect(buildSourceHealthPresentation(input({
      headlineTrust: trust("fresh"),
      sourceError: "provider error",
      lang: "pt",
    })).reason).toBe("Não foi possível verificar as fontes.");

    expect(buildSourceHealthPresentation(input({
      liveTrust: trust("updating"),
      headlineTrust: trust("fresh", "headline reason"),
    })).reason).toBeUndefined();
  });

  it("returns no optional warning when no raw optional failure is present", () => {
    expect(buildSourceHealthPresentation(input({
      sources: [source({ sourceId: "nasa-firms-viirs", tier: "optional", status: "error" })],
    })).optionalLayerWarning).toBeUndefined();
  });
});
