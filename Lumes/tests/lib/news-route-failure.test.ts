import { beforeEach, describe, expect, it, vi } from "vitest";

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET } from "@/app/api/news/route";

describe("news route failure contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts aggregation failures and prevents caching", async () => {
    cached.mockRejectedValueOnce(new Error("private news aggregation detail"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "lumes-curated",
      matched: [],
      incidents: [],
      press: [],
      sources: expect.any(Array),
      placesTracked: [],
      placesMatched: [],
      dataState: { state: "retryable-error", source: "lumes-curated-news" },
    });
    expect(JSON.stringify(payload)).not.toContain("private news aggregation detail");
  });
});
