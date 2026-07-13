import { describe, expect, it } from "vitest";
import { createDataStateMeta } from "@/lib/data-state";
import { deriveDataTrust } from "@/lib/data-trust";

describe("data trust contract", () => {
  it("uses source freshness instead of response observation time", () => {
    const meta = createDataStateMeta("healthy", undefined, "2026-07-09T11:58:00.000Z", "ANEPC");
    const trust = deriveDataTrust({
      meta,
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: false,
      error: null,
    });

    expect(trust.state).toBe("fresh");
    expect(trust.sourceUpdatedAt).toBe("2026-07-09T11:58:00.000Z");
    expect(trust.observedAt).toBe("2026-07-09T12:00:00.000Z");
    expect(trust.source).toBe("ANEPC");
  });

  it("does not infer provider freshness from the client metadata timestamp", () => {
    const trust = deriveDataTrust({
      meta: createDataStateMeta("healthy"),
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: false,
      error: null,
    });

    expect(trust.sourceUpdatedAt).toBeNull();
  });

  it("keeps fallback and retry reasons visible when old data is retained", () => {
    const trust = deriveDataTrust({
      meta: createDataStateMeta("fallback", "Live source unavailable", "2026-07-09T11:00:00.000Z"),
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: false,
      error: "request failed",
    });

    expect(trust.state).toBe("fallback");
    expect(trust.reason).toBe("Live source unavailable");
  });

  it("does not let healthy metadata mask a refresh error", () => {
    const trust = deriveDataTrust({
      meta: createDataStateMeta("healthy", undefined, undefined, "ANEPC"),
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: false,
      error: "request failed",
    });

    expect(trust.state).toBe("error");
    expect(trust.reason).toBe("Unable to refresh this data");
  });

  it("maps stale, empty, and retryable metadata without inferring from observation time", () => {
    const observedAt = new Date("2026-07-09T12:00:00.000Z");
    expect(deriveDataTrust({
      meta: createDataStateMeta("stale", "Source timestamp is old", "2026-07-09T11:00:00.000Z", "ANEPC"),
      observedAt,
      source: "incidents",
      loading: false,
      error: null,
    })).toMatchObject({ state: "stale", sourceUpdatedAt: "2026-07-09T11:00:00.000Z", reason: "Source timestamp is old" });
    expect(deriveDataTrust({
      meta: createDataStateMeta("empty", "No incidents", undefined, "ANEPC"),
      observedAt,
      source: "incidents",
      loading: false,
      error: null,
    }).state).toBe("empty");
    expect(deriveDataTrust({
      meta: createDataStateMeta("retryable-error", undefined, undefined, "ANEPC"),
      observedAt,
      source: "incidents",
      loading: false,
      error: "network failed",
    })).toMatchObject({ state: "error", reason: "Unable to refresh this data" });
  });

  it("reports an updating state before the first response", () => {
    expect(deriveDataTrust({
      meta: null,
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: true,
      error: null,
    })).toMatchObject({ state: "updating", source: "incidents", sourceUpdatedAt: null });
  });

  it("does not treat malformed runtime metadata as fresh", () => {
    const trust = deriveDataTrust({
      meta: { state: "bogus", updatedAt: "not-a-date" } as never,
      observedAt: new Date("2026-07-09T12:00:00.000Z"),
      source: "incidents",
      loading: false,
      error: null,
    });

    expect(trust).toMatchObject({
      state: "error",
      source: "incidents",
      sourceUpdatedAt: null,
      reason: "Invalid data state metadata",
    });
  });
});
