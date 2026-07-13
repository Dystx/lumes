import { beforeEach, describe, expect, it, vi } from "vitest";

const { cached, invalidate } = vi.hoisted(() => ({ cached: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/api/cache", () => ({ cached, invalidate }));

const { findFirst, count } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { incident: { findFirst, count } },
}));

import { GET } from "@/app/api/health/route";

describe("health route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidate();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
  });

  it("reports an empty reachable database as healthy", async () => {
    findFirst.mockResolvedValue(null);
    count.mockResolvedValue(0);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      checks: { database: "ok" },
      dataState: { state: "healthy" },
    });
  });

  it("reports a non-empty database as degraded when the latest ingest is stale", async () => {
    findFirst.mockResolvedValue({ lastSeen: new Date(Date.now() - 6 * 60 * 1000) });
    count.mockResolvedValue(1);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "degraded",
      checks: { database: "fail" },
      dataState: { state: "stale" },
    });
  });

  it("reports a persistence failure as a redacted degraded response", async () => {
    findFirst.mockRejectedValue(new Error("private database connection detail"));
    count.mockResolvedValue(1);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "degraded",
      checks: { database: "fail" },
      dataState: { state: "stale" },
    });
    expect(JSON.stringify(payload)).not.toContain("private database connection detail");
  });

  it("reports a health-cache failure as a redacted degraded response", async () => {
    cached.mockRejectedValueOnce(new Error("private health cache detail"));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "degraded",
      checks: { cache: "fail" },
      dataState: { state: "stale" },
    });
    expect(JSON.stringify(payload)).not.toContain("private health cache detail");
  });
});
