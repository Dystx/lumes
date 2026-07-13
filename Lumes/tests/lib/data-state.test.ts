import { describe, expect, it } from "vitest";
import {
  classifyDataState,
  createDataStateMeta,
  dataStateMessage,
  normalizeDataStateMeta,
  resolveDataStateMeta,
} from "@/lib/data-state";
import { shouldMarkUsingFallback } from "@/lib/use-fetch";

describe("data state contract", () => {
  it("classifies fallback data as distinct from healthy data", () => {
    expect(classifyDataState({ fallback: true, count: 12 })).toBe("fallback");
    expect(classifyDataState({ count: 12 })).toBe("healthy");
  });

  it("classifies a successful empty data set without calling it stale", () => {
    expect(classifyDataState({ count: 0 })).toBe("empty");
  });

  it("preserves source timestamp and source name in response metadata", () => {
    expect(createDataStateMeta("healthy", undefined, "2026-07-09T11:58:00.000Z", "ANEPC")).toEqual({
      state: "healthy",
      updatedAt: expect.any(String),
      sourceUpdatedAt: "2026-07-09T11:58:00.000Z",
      source: "ANEPC",
    });
  });

  it("normalizes valid metadata and preserves provider freshness", () => {
    expect(normalizeDataStateMeta({
      state: "stale",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sourceUpdatedAt: "2026-07-09T11:58:00.000Z",
      reason: "Source timestamp is old",
      source: "ANEPC",
    })).toEqual({
      state: "stale",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sourceUpdatedAt: "2026-07-09T11:58:00.000Z",
      reason: "Source timestamp is old",
      source: "ANEPC",
    });
  });

  it.each([
    ["unknown state", { state: "bogus", updatedAt: "2026-07-09T12:00:00.000Z" }],
    ["invalid updated timestamp", { state: "healthy", updatedAt: "not-a-date" }],
    ["impossible updated timestamp", { state: "healthy", updatedAt: "2026-02-30T12:00:00.000Z" }],
    ["invalid source timestamp", { state: "healthy", updatedAt: "2026-07-09T12:00:00.000Z", sourceUpdatedAt: "not-a-date" }],
    ["invalid reason", { state: "healthy", updatedAt: "2026-07-09T12:00:00.000Z", reason: 42 }],
    ["invalid source", { state: "healthy", updatedAt: "2026-07-09T12:00:00.000Z", source: "" }],
  ])("rejects %s metadata", (_label, value) => {
    expect(normalizeDataStateMeta(value)).toBeNull();
  });

  it("keeps absent metadata compatible while failing closed for present malformed metadata", () => {
    expect(resolveDataStateMeta(undefined)).toMatchObject({ valid: true, meta: { state: "healthy" } });
    expect(resolveDataStateMeta(null)).toMatchObject({
      valid: false,
      meta: { state: "retryable-error", reason: "Invalid data state metadata" },
    });
  });

  it("exposes safe actionable context for retryable failures", () => {
    expect(dataStateMessage("retryable-error", "pt")).toBe("Não foi possível atualizar estes dados. Tente novamente.");
    expect(dataStateMessage("fallback", "en")).toBe("Showing fallback data; live source is unavailable.");
  });

  it("marks retained data as fallback after a refresh failure", () => {
    expect(shouldMarkUsingFallback({ data: { incidents: [] }, loading: false, error: "Network unavailable" })).toBe(true);
    expect(shouldMarkUsingFallback({ data: { incidents: [] }, loading: false, error: null })).toBe(false);
  });
});
