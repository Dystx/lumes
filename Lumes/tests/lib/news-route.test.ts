import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";
import { GET } from "@/app/api/news/route";

describe("news route contract", () => {
  beforeEach(() => {
    invalidate();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/incidents")) {
        return Promise.resolve(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns the typed aggregate envelope and explicit data state", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    await expect(response.json()).resolves.toMatchObject({
      source: "lumes-curated",
      matched: [],
      incidents: [],
      press: [],
      sources: expect.any(Array),
      counts: { matched: 0, incidents: 0, press: 0, sources: expect.any(Number) },
      dataState: { state: "healthy", source: "lumes-curated-news" },
    });
  });

  it("filters unrelated RSS items and cross-matches fire news to active places", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/incidents")) {
        return Promise.resolve(new Response(JSON.stringify({ incidents: [{
          id: "incident-sintra",
          displayName: "Incêndio em Sintra",
          firstDetected: "2026-07-12T10:00:00.000Z",
          severity: "high",
          properties: { municipality: "Sintra", parish: "Alcabideche", region: "Lisboa" },
        }] }), { status: 200 }));
      }
      if (url.includes("publico")) {
        return Promise.resolve(new Response(`<rss><channel>
          <item><title>Incêndio florestal em Sintra mobiliza bombeiros</title><link>https://example.test/sintra</link><description>Operação em curso.</description><pubDate>Sun, 12 Jul 2026 10:00:00 GMT</pubDate><guid>sintra-1</guid></item>
          <item><title>Fogo de artifício anima a noite</title><link>https://example.test/fireworks</link><description>Evento cultural.</description><pubDate>Sun, 12 Jul 2026 09:00:00 GMT</pubDate><guid>fireworks-1</guid></item>
        </channel></rss>`, { status: 200 }));
      }
      return Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      matched: [expect.objectContaining({ title: expect.stringContaining("Sintra"), matched: true })],
      incidents: [expect.objectContaining({ municipality: "Sintra" })],
      press: [],
      placesTracked: expect.arrayContaining(["Sintra"]),
      placesMatched: expect.arrayContaining(["Sintra"]),
      placesUnmatched: expect.arrayContaining(["Alcabideche", "Lisboa"]),
    });
    expect(JSON.stringify(payload)).not.toContain("Fogo de artifício anima");
  });

  it("keeps healthy press results when one RSS provider is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/incidents")) {
        return Promise.resolve(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
      }
      if (url.includes("publico")) {
        return Promise.resolve(new Response("upstream unavailable", { status: 503 }));
      }
      if (url.includes("observador")) {
        return Promise.resolve(new Response(`<rss><channel><item><title>Incêndio rural com meios aéreos</title><link>https://example.test/valid</link><description>Notícia validada.</description><pubDate>Sun, 12 Jul 2026 10:00:00 GMT</pubDate><guid>valid-1</guid></item></channel></rss>`, { status: 200 }));
      }
      return Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      press: [expect.objectContaining({ title: "Incêndio rural com meios aéreos" })],
      dataState: { state: "healthy", source: "lumes-curated-news" },
    });
  });

  it("keeps press context when the internal incident response is non-OK or malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/incidents")) {
        return Promise.resolve(new Response("not-json", { status: 502 }));
      }
      if (url.includes("publico")) {
        return Promise.resolve(new Response(`<rss><channel><item><title>Incêndio florestal no distrito</title><link>https://example.test/context</link><description>Contexto.</description><pubDate>Sun, 12 Jul 2026 10:00:00 GMT</pubDate><guid>context-1</guid></item></channel></rss>`, { status: 200 }));
      }
      return Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      incidents: [],
      matched: [],
      press: [expect.objectContaining({ title: "Incêndio florestal no distrito" })],
    });
  });
});
