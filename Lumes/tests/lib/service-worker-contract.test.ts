import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service worker data freshness contract", () => {
  it("does not cache API responses that carry live incident and health state", () => {
    const serviceWorker = readFileSync("public/sw.js", "utf8");

    expect(serviceWorker).toContain('if (url.pathname.startsWith("/api/")) return;');
    expect(serviceWorker).not.toContain("API_CACHE_MAX_AGE_MS");
  });

  it("returns static cache writes through the refresh promise", () => {
    const serviceWorker = readFileSync("public/sw.js", "utf8");

    expect(serviceWorker).toContain("return cache.put(req, res).catch(() => {});");
    expect(serviceWorker).toContain("void cache.put(req, res.clone()).catch(() => {});");
  });
});
