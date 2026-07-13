import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, cached } = vi.hoisted(() => ({
  db: { incident: { findUnique: vi.fn() } },
  cached: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/api/cache", () => ({ cached }));

import { GET as incidentNewsGet } from "@/app/api/incidents/[id]/news/route";

const requestFor = (id = "incident-1") => [
  new NextRequest(`http://localhost/api/incidents/${id}/news`),
  { params: Promise.resolve({ id }) },
] as const;

describe("incident news route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cached.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
    db.incident.findUnique.mockResolvedValue({ parish: null, municipality: null, district: null });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns a cacheable empty state when an incident has no location", async () => {
    const response = await incidentNewsGet(...requestFor());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({ incidentId: "incident-1", count: 0, items: [], dataState: { state: "empty", source: "incident-news" } });
    expect(cached).not.toHaveBeenCalled();
  });

  it("returns matched press items with a healthy state", async () => {
    db.incident.findUnique.mockResolvedValue({ parish: null, municipality: "Lisboa", district: "Lisboa" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "<rss><channel><item><title>Incêndio florestal em Lisboa</title><link>https://news.test/fire</link><description>Bombeiros combatem o incêndio em Lisboa.</description><pubDate>2026-07-12T06:00:00.000Z</pubDate></item></channel></rss>",
      { status: 200 },
    )));

    const response = await incidentNewsGet(...requestFor());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(payload).toMatchObject({
      incidentId: "incident-1",
      count: 1,
      dataState: { state: "healthy", source: "incident-news" },
      items: [{ sourceUrl: "https://news.test/fire", matched: true, matchedOn: "Lisboa" }],
    });
  });

  it("redacts cached news failures and prevents caching", async () => {
    db.incident.findUnique.mockResolvedValue({ parish: null, municipality: "Lisboa", district: "Lisboa" });
    cached.mockRejectedValueOnce(new Error("private RSS/cache detail"));

    const response = await incidentNewsGet(...requestFor());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error", source: "incident-news" }, items: [] });
    expect(JSON.stringify(payload)).not.toContain("private RSS/cache detail");
  });
});
