import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE as deleteAlerts, GET as getAlerts, POST as postAlerts } from "@/app/api/alerts/route";
import { rateLimit, resetRateLimit } from "@/lib/api/rate-limit";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { alertSubscription: { findMany } },
}));

import { checkAlertTriggers } from "@/app/api/alerts/route";

describe("alert ownership contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimit();
  });

  it("returns a redacted no-store unavailable envelope for GET", async () => {
    const response = await getAlerts();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ count: 0, subscriptions: [], dataState: { state: "retryable-error" } });
  });

  it("rejects cross-origin alert mutations before rate limiting", async () => {
    const response = await postAlerts(new NextRequest("https://lumes.pt/api/alerts", {
      method: "POST",
      headers: { origin: "https://attacker.invalid", "content-type": "application/json" },
      body: JSON.stringify({ latitude: 38.72, longitude: -9.14 }),
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "empty" } });
  });

  it("returns the unavailable state for allowed POST and DELETE mutations", async () => {
    const headers = { origin: "http://localhost", "content-type": "application/json" };
    const [postResponse, deleteResponse] = await Promise.all([
      postAlerts(new NextRequest("http://localhost/api/alerts", { method: "POST", headers, body: "{}" })),
      deleteAlerts(new NextRequest("http://localhost/api/alerts", { method: "DELETE", headers, body: "{}" })),
    ]);

    expect(postResponse.status).toBe(503);
    expect(deleteResponse.status).toBe(503);
    expect(postResponse.headers.get("cache-control")).toBe("no-store");
    expect(deleteResponse.headers.get("cache-control")).toBe("no-store");
  });

  it("rate-limits alert mutations before returning ownership-unavailable state", async () => {
    for (let index = 0; index < 10; index += 1) rateLimit("alerts-test", { limit: 10 });
    const request = new NextRequest("http://localhost/api/alerts", {
      method: "DELETE",
      headers: { origin: "http://localhost", "x-real-ip": "alerts-test" },
    });

    const response = await deleteAlerts(request);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ dataState: { state: "retryable-error" } });
  });

  it("fails closed without querying shared alert subscriptions", async () => {
    const result = await checkAlertTriggers({
      latitude: 38.72,
      longitude: -9.14,
      eventType: "wildfire",
      severity: "critical",
      displayName: "Lisboa",
    });

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
