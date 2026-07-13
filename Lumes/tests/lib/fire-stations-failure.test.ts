import { beforeEach, describe, expect, it, vi } from "vitest";

const { cached } = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET } from "@/app/api/fire-stations/route";

describe("fire stations failure contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redacts unexpected cache failures and prevents caching", async () => {
    cached.mockRejectedValueOnce(new Error("private station aggregation detail"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      source: "osm-fire-stations",
      count: 0,
      stations: [],
      dataState: { state: "retryable-error", source: "osm-fire-stations" },
    });
    expect(JSON.stringify(payload)).not.toContain("private station aggregation detail");
  });
});
