import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runIngest, db } = vi.hoisted(() => ({
  runIngest: vi.fn(),
  db: {
    incident: { updateMany: vi.fn(), deleteMany: vi.fn() },
    incidentSnapshot: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/ingest", () => ({ runIngest }));
vi.mock("@/lib/db", () => ({ db }));

import { GET as ingestGet, POST as ingestPost } from "@/app/api/cron/ingest/route";
import { GET as pruneGet } from "@/app/api/cron/prune/route";

describe("cron route security and cache contracts", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
    runIngest.mockResolvedValue({ fetched: 1, upserted: 1, errors: [] });
    db.incident.updateMany.mockResolvedValue({ count: 1 });
    db.incidentSnapshot.deleteMany.mockResolvedValue({ count: 2 });
    db.incident.deleteMany.mockResolvedValue({ count: 3 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed and prevents caching when ingest has no configured secret", async () => {
    delete process.env.CRON_SECRET;
    const response = await ingestGet(new NextRequest("http://localhost/api/cron/ingest"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("accepts the authenticated ingest header and keeps the result private", async () => {
    const response = await ingestPost(new NextRequest("http://localhost/api/cron/ingest", {
      method: "POST",
      headers: { authorization: "Bearer cron-test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ upserted: 1 });
    expect(runIngest).toHaveBeenCalledOnce();
  });

  it("redacts ingest failures", async () => {
    runIngest.mockRejectedValue(new Error("private token=secret"));
    const response = await ingestGet(new NextRequest("http://localhost/api/cron/ingest", {
      headers: { "x-cron-secret": "cron-test-secret" },
    }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({ error: "Ingest is temporarily unavailable." });
    expect(JSON.stringify(payload)).not.toContain("private token=secret");
  });

  it("fails closed and prevents caching when prune is unauthenticated", async () => {
    const response = await pruneGet(new NextRequest("http://localhost/api/cron/prune"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.incident.updateMany).not.toHaveBeenCalled();
  });

  it("keeps successful prune results non-cacheable", async () => {
    const response = await pruneGet(new NextRequest("http://localhost/api/cron/prune", {
      headers: { authorization: "Bearer cron-test-secret" },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ ok: true, compact: { marked: 1 }, snapshots: { deleted: 2 }, incidents: { deleted: 3 } });
  });

  it("redacts prune failures", async () => {
    db.incident.updateMany.mockRejectedValue(new Error("private database detail"));
    const response = await pruneGet(new NextRequest("http://localhost/api/cron/prune", {
      headers: { "x-cron-secret": "cron-test-secret" },
    }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({ error: "Prune is temporarily unavailable." });
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });
});
