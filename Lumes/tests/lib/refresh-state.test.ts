import { describe, expect, it } from "vitest";
import { resolveRefreshOutcome } from "@/lib/refresh-state";

describe("refresh lifecycle", () => {
  it("does not resolve when no refresh is active", () => {
    expect(resolveRefreshOutcome({
      inFlight: false,
      startedAt: 100,
      loading: false,
      failed: false,
      refetchedAt: new Date(200),
      previousRefetchedAt: null,
    })).toBeNull();
  });

  it("prioritizes a failed request over success evidence", () => {
    expect(resolveRefreshOutcome({
      inFlight: true,
      startedAt: 100,
      loading: false,
      failed: true,
      refetchedAt: new Date(200),
      previousRefetchedAt: null,
    })).toBe("error");
  });

  it("waits for loading to settle and a newer fetch timestamp", () => {
    const input = {
      inFlight: true,
      startedAt: 100,
      loading: true,
      failed: false,
      refetchedAt: new Date(200),
      previousRefetchedAt: null,
    };
    expect(resolveRefreshOutcome(input)).toBeNull();
    expect(resolveRefreshOutcome({ ...input, loading: false, refetchedAt: new Date(99) })).toBeNull();
    expect(resolveRefreshOutcome({ ...input, loading: false })).toBe("success");
    expect(resolveRefreshOutcome({
      ...input,
      loading: false,
      previousRefetchedAt: input.refetchedAt,
    })).toBeNull();
  });

  it("does not resolve without a request timestamp", () => {
    expect(resolveRefreshOutcome({
      inFlight: true,
      startedAt: null,
      loading: false,
      failed: false,
      refetchedAt: new Date(),
      previousRefetchedAt: null,
    })).toBeNull();
  });
});
