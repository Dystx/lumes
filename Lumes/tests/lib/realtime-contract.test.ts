import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { GET as realtimeGet, incidentFeedUrl } from "@/app/api/realtime/route";
import { rateLimit, resetRateLimit } from "@/lib/api/rate-limit";

const source = readFileSync(resolve(process.cwd(), "src/app/api/realtime/route.ts"), "utf8");

describe("realtime polling contract", () => {
  beforeEach(() => resetRateLimit());
  afterEach(() => {
    resetRateLimit();
    vi.unstubAllGlobals();
  });

  it("bounds each poll and prevents overlapping requests", () => {
    expect(source).toContain("let inFlight = false");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("if (inFlight) return");
    expect(source).toContain("pollController?.abort()");
    expect(source).toContain("incidentFeedUrl(request.url)");
    expect(incidentFeedUrl("http://127.0.0.1:3311/api/realtime")).toBe("http://127.0.0.1:3311/api/incidents");
  });

  it("starts with a connected SSE event and closes when the request aborts", async () => {
    const abort = new AbortController();
    const response = await realtimeGet(new NextRequest("http://localhost/api/realtime", { signal: abort.signal }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    const text = new TextDecoder().decode(first.value);
    expect(text).toMatch(/data: \{"type":"connected","timestamp":"/);

    abort.abort();
    await reader!.cancel().catch(() => undefined);
  });

  it("polls immediately after connecting instead of waiting for the first interval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      count: 1,
      incidents: [{ id: "incident-1", displayName: "Lisboa" }],
    }), { status: 200 })));

    const abort = new AbortController();
    const response = await realtimeGet(new NextRequest("http://localhost/api/realtime", { signal: abort.signal }));
    const reader = response.body!.getReader();
    await reader.read();

    const second = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("initial realtime poll did not settle")), 750)),
    ]);
    const third = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("initial realtime incident event did not settle")), 750)),
    ]);
    const text = `${new TextDecoder().decode(second.value)}${new TextDecoder().decode(third.value)}`;

    expect(text).toContain('"type":"heartbeat"');
    expect(text).toContain('"type":"new-incident"');
    expect(text).toContain('"incident-1"');

    abort.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("returns a no-store JSON rate-limit envelope before opening a stream", async () => {
    for (let index = 0; index < 10; index += 1) rateLimit("realtime-test", { limit: 10, windowMs: 60_000 });

    const response = await realtimeGet(new NextRequest("http://localhost/api/realtime", {
      headers: { "x-real-ip": "realtime-test" },
    }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload).toMatchObject({ dataState: { state: "retryable-error" } });
  });
});
