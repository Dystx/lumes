import { describe, expect, it, vi } from "vitest";
import { fetchJsonWithTimeout, resolveResponseDataState } from "@/lib/use-fetch";

describe("fetchJsonWithTimeout", () => {
  it("aborts a timed-out attempt and succeeds on the next fresh attempt", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(fetchJsonWithTimeout("/api/retry", {
      timeoutMs: 5,
      fetchImpl,
    })).rejects.toMatchObject({ name: "AbortError" });

    await expect(fetchJsonWithTimeout("/api/retry", {
      timeoutMs: 50,
      fetchImpl,
    })).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstSignal = fetchImpl.mock.calls[0]?.[1]?.signal;
    const secondSignal = fetchImpl.mock.calls[1]?.[1]?.signal;
    expect(firstSignal).toBeDefined();
    expect(secondSignal).toBeDefined();
    expect(firstSignal).not.toBe(secondSignal);
  });

  it("keeps absent response metadata compatible", () => {
    expect(resolveResponseDataState(undefined)).toMatchObject({ valid: true, meta: { state: "healthy" } });
  });

  it("turns malformed success metadata into a retryable trust state", () => {
    expect(resolveResponseDataState({ state: "bogus", updatedAt: "not-a-date" })).toMatchObject({
      valid: false,
      meta: { state: "retryable-error", reason: "Invalid data state metadata" },
    });
  });

  it("preserves valid stale and source freshness metadata", () => {
    expect(resolveResponseDataState({
      state: "stale",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sourceUpdatedAt: "2026-07-09T11:00:00.000Z",
      source: "ANEPC",
    })).toEqual({
      valid: true,
      meta: {
        state: "stale",
        updatedAt: "2026-07-09T12:00:00.000Z",
        sourceUpdatedAt: "2026-07-09T11:00:00.000Z",
        source: "ANEPC",
      },
    });
  });
});
