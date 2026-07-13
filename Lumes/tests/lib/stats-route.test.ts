import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";

vi.mock("@/lib/persistence", () => ({
  getPersistenceStats: vi.fn(),
}));

import { getPersistenceStats } from "@/lib/persistence";
import { GET } from "@/app/api/stats/route";

describe("persistence stats route", () => {
  beforeEach(() => {
    invalidate();
    vi.mocked(getPersistenceStats).mockReset();
  });

  it("returns a cacheable typed health envelope for populated stats", async () => {
    vi.mocked(getPersistenceStats).mockResolvedValue({ total: 4, active: 2, resolved: 2, snapshots: 8 });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    await expect(response.json()).resolves.toMatchObject({
      total: 4,
      dataState: { state: "healthy", source: "persistence" },
    });
  });

  it("labels an empty database explicitly instead of implying healthy data", async () => {
    vi.mocked(getPersistenceStats).mockResolvedValue({ total: 0, active: 0, resolved: 0, snapshots: 0 });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "empty" } });
  });

  it("redacts persistence failures and returns a retryable no-store envelope", async () => {
    vi.mocked(getPersistenceStats).mockRejectedValue(new Error("sqlite path=/private/secret"));

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.error).toBe("Persistence statistics are temporarily unavailable.");
    expect(body.dataState).toMatchObject({ state: "retryable-error" });
    expect(JSON.stringify(body)).not.toContain("/private/secret");
  });
});
