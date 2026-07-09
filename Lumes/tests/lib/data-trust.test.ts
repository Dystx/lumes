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
});
