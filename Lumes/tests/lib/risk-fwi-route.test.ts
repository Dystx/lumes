import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { invalidate } from "@/lib/api/cache";
import { GET } from "@/app/api/risk-fwi/[day]/route";

describe("fire-risk forecast route contract", () => {
  beforeEach(() => invalidate());
  afterEach(() => vi.unstubAllGlobals());

  it("rejects unknown forecast days with a non-cacheable empty state", async () => {
    const response = await GET(new NextRequest("http://localhost/api/risk-fwi/yesterday"), {
      params: Promise.resolve({ day: "yesterday" }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "empty" } });
  });

  it("returns a cacheable healthy forecast envelope for a valid day", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ globalIdLocal: 111, idDistrito: 11, forecastDate: "2026-07-12" }],
    }), { status: 200 })));

    const response = await GET(new NextRequest("http://localhost/api/risk-fwi/today"), {
      params: Promise.resolve({ day: "TODAY" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=21600");
    await expect(response.json()).resolves.toMatchObject({
      when: "today",
      data: [{ globalIdLocal: 111 }],
      dataState: { state: "healthy", source: "ipma" },
    });
  });

  it("redacts upstream failures and returns a non-cacheable retryable state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("token=private")));

    const response = await GET(new NextRequest("http://localhost/api/risk-fwi/tomorrow"), {
      params: Promise.resolve({ day: "tomorrow" }),
    });
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("Fire-risk data is temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("token=private");
    expect(body.dataState).toMatchObject({ state: "retryable-error" });
  });

  it("rejects a malformed successful forecast container", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ forecast: [] }), { status: 200 })));

    const response = await GET(new NextRequest("http://localhost/api/risk-fwi/today"), {
      params: Promise.resolve({ day: "today" }),
    });
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ dataState: { state: "retryable-error" } });
  });

  it("returns an explicit cacheable empty state when every forecast row is unusable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { globalIdLocal: "bad", idDistrito: 11, forecastDate: "not-a-date" },
        { rcm: 8 },
        { unrelated: true },
      ],
    }), { status: 200 })));

    const response = await GET(new NextRequest("http://localhost/api/risk-fwi/after"), {
      params: Promise.resolve({ day: "after" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=21600");
    expect(body).toMatchObject({
      when: "after",
      data: [],
      dataState: { state: "empty", source: "ipma" },
    });
  });
});
