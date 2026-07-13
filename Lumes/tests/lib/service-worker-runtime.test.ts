import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FetchEventLike {
  request: { method: string; mode: string; url: string };
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
}

interface ActivateEventLike {
  waitUntil: ReturnType<typeof vi.fn>;
}

function loadWorker() {
  const listeners = new Map<string, (event: FetchEventLike) => void>();
  const fetchMock = vi.fn();
  const cachePut = vi.fn(async () => undefined);
  const cacheMatch = vi.fn(async () => undefined);
  const cache = { addAll: vi.fn(async () => undefined), put: cachePut, match: cacheMatch };
  const caches = {
    open: vi.fn(async () => cache),
    match: cacheMatch,
    keys: vi.fn(async () => ["old-cache"]),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: "https://lumes.pt" },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: vi.fn((type: string, handler: (event: FetchEventLike) => void) => listeners.set(type, handler)),
  };

  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    caches,
    fetch: fetchMock,
    console,
    URL,
    Date,
    Promise,
    Response,
  });

  return { listeners, fetchMock, cachePut, cacheMatch, caches };
}

function event(url: string, mode = "cors"): FetchEventLike {
  return {
    request: { method: "GET", mode, url },
    respondWith: vi.fn(),
    waitUntil: vi.fn(),
  };
}

describe("service worker runtime policy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("bypasses live APIs and cross-origin tiles without touching the cache", () => {
    const { listeners, fetchMock, cachePut } = loadWorker();
    const apiEvent = event("https://lumes.pt/api/health");
    const tileEvent = event("https://tiles.example.test/12/1/2.pbf");

    listeners.get("fetch")?.(apiEvent);
    listeners.get("fetch")?.(tileEvent);

    expect(apiEvent.respondWith).not.toHaveBeenCalled();
    expect(tileEvent.respondWith).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
  });

  it("uses network-first navigation and a cache-first static branch", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    fetchMock.mockResolvedValue(new Response("fresh", { status: 200 }));

    const navigation = event("https://lumes.pt/status", "navigate");
    listeners.get("fetch")?.(navigation);
    expect(navigation.respondWith).toHaveBeenCalledTimes(1);
    await navigation.respondWith.mock.calls[0][0];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachePut).toHaveBeenCalled();
    expect(navigation.waitUntil).toHaveBeenCalledTimes(1);
    await expect(navigation.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();

    cacheMatch.mockResolvedValue(new Response("cached", { status: 200 }));
    const staticAsset = event("https://lumes.pt/static/icon.svg");
    listeners.get("fetch")?.(staticAsset);
    expect(staticAsset.respondWith).toHaveBeenCalledTimes(1);
    await staticAsset.respondWith.mock.calls[0][0];
    expect(cacheMatch).toHaveBeenCalled();
  });

  it("does not cache non-OK navigations and falls back to the last good page offline", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    fetchMock.mockResolvedValueOnce(new Response("server error", { status: 500 }));

    const failedNavigation = event("https://lumes.pt/status", "navigate");
    listeners.get("fetch")?.(failedNavigation);
    const failedResponse = await failedNavigation.respondWith.mock.calls[0][0];

    expect(failedResponse.status).toBe(500);
    expect(cachePut).not.toHaveBeenCalled();

    cacheMatch.mockResolvedValueOnce(new Response("cached status", { status: 200 }));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const offlineNavigation = event("https://lumes.pt/status", "navigate");
    listeners.get("fetch")?.(offlineNavigation);
    const offlineResponse = await offlineNavigation.respondWith.mock.calls[0][0];

    expect(offlineResponse.status).toBe(200);
    await expect(offlineResponse.text()).resolves.toBe("cached status");
  });

  it("settles a rejected navigation cache write through waitUntil", async () => {
    const { listeners, fetchMock, cachePut } = loadWorker();
    fetchMock.mockResolvedValueOnce(new Response("fresh", { status: 200 }));
    cachePut.mockRejectedValueOnce(new Error("cache write failed"));

    const navigation = event("https://lumes.pt/status", "navigate");
    listeners.get("fetch")?.(navigation);
    await navigation.respondWith.mock.calls[0][0];

    expect(navigation.waitUntil).toHaveBeenCalledTimes(1);
    await expect(navigation.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("serves stale static assets while refreshing them, including cache entries without Date", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    const stale = new Response("stale", {
      status: 200,
      headers: { date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toUTCString() },
    });
    cacheMatch.mockResolvedValueOnce(stale);
    fetchMock.mockResolvedValueOnce(new Response("fresh", { status: 200 }));

    const staticAsset = event("https://lumes.pt/static/icon.svg");
    listeners.get("fetch")?.(staticAsset);
    const response = await staticAsset.respondWith.mock.calls[0][0];

    expect(await response.text()).toBe("stale");
    expect(staticAsset.waitUntil).toHaveBeenCalledTimes(1);
    await staticAsset.waitUntil.mock.calls[0][0];
    expect(cachePut).toHaveBeenCalled();

    cacheMatch.mockResolvedValueOnce(new Response("no-date", { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response("refreshed-no-date", { status: 200 }));
    const noDateAsset = event("https://lumes.pt/static/no-date.svg");
    listeners.get("fetch")?.(noDateAsset);
    const noDateResponse = await noDateAsset.respondWith.mock.calls[0][0];

    expect(await noDateResponse.text()).toBe("no-date");
    expect(noDateAsset.waitUntil).toHaveBeenCalledTimes(1);
    await noDateAsset.waitUntil.mock.calls[0][0];
  });

  it("keeps a stale static asset when its refresh fails and resolves waitUntil", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    cacheMatch.mockResolvedValueOnce(new Response("last-known-good", {
      status: 200,
      headers: { date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toUTCString() },
    }));
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    const staticAsset = event("https://lumes.pt/static/icon.svg");
    listeners.get("fetch")?.(staticAsset);
    const response = await staticAsset.respondWith.mock.calls[0][0];
    expect(await response.text()).toBe("last-known-good");

    await expect(staticAsset.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    expect(cachePut).not.toHaveBeenCalled();
  });

  it("swallows stale refresh cache-write failures without an unhandled waitUntil rejection", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    cacheMatch.mockResolvedValueOnce(new Response("last-known-good", {
      status: 200,
      headers: { date: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toUTCString() },
    }));
    fetchMock.mockResolvedValueOnce(new Response("fresh", { status: 200 }));
    cachePut.mockRejectedValueOnce(new Error("cache write failed"));

    const staticAsset = event("https://lumes.pt/static/icon.svg");
    listeners.get("fetch")?.(staticAsset);
    const response = await staticAsset.respondWith.mock.calls[0][0];

    expect(await response.text()).toBe("last-known-good");
    await expect(staticAsset.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("returns a deterministic 503 for a non-OK uncached static response", async () => {
    const { listeners, fetchMock, cachePut, cacheMatch } = loadWorker();
    cacheMatch.mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const staticAsset = event("https://lumes.pt/static/missing.svg");
    listeners.get("fetch")?.(staticAsset);
    const response = await staticAsset.respondWith.mock.calls[0][0];

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("offline");
    expect(cachePut).not.toHaveBeenCalled();
  });

  it("deletes previous Lumes runtime cache versions but preserves foreign caches", async () => {
    const { listeners, caches } = loadWorker();
    caches.keys.mockResolvedValueOnce([
      "lumes-runtime-old",
      "lumes-runtime",
      "foreign-cache",
    ]);
    const activation: ActivateEventLike = { waitUntil: vi.fn() };

    listeners.get("activate")?.(activation as unknown as FetchEventLike);
    await activation.waitUntil.mock.calls[0][0];

    expect(caches.keys).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledWith("lumes-runtime-old");
    expect(caches.delete).not.toHaveBeenCalledWith("foreign-cache");
  });
});
