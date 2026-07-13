import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildStatusViewModel, loadStatusPageData, statusBaseUrl, STATUS_LOADING_LABEL, type StatusPageData } from "@/app/status/page";

describe("status page fetch contract", () => {
  it("does not combine conflicting Next fetch cache directives", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/status/page.tsx"), "utf8");

    expect(source).toContain('cache: "no-store"');
    expect(source).not.toContain("next: { revalidate: 30 }");
    expect(source).toContain('data-status-state="loading"');
  });

  it.each([
    { name: "healthy", health: "ok" as const, sourceCount: 1, overall: "ok" as const, sourceState: "available" as const },
    { name: "healthy with empty source response", health: "ok" as const, sourceCount: 0, overall: "ok" as const, sourceState: "empty" as const },
    { name: "degraded", health: "degraded" as const, sourceCount: 1, overall: "degraded" as const, sourceState: "available" as const },
    { name: "empty fallback", health: "degraded" as const, sourceCount: 0, overall: "degraded" as const, sourceState: "empty" as const },
  ])("derives the $name presentation state", ({ health, sourceCount, overall, sourceState }) => {
    const data: StatusPageData = {
      health: {
        status: health,
        timestamp: "2026-07-12T00:00:00.000Z",
        uptime_s: 10,
        latencyMs: 2,
        checks: {},
        lastIncidentUpdate: null,
      },
      stats: { total: 0, active: 0, resolved: 0, snapshots: 0 },
      sources: {
        sources: Array.from({ length: sourceCount }, (_, index) => ({
          sourceId: `source-${index}`,
          sourceName: `Source ${index}`,
          status: "ok" as const,
          lastSuccess: null,
          lastError: null,
          recordCount: 0,
          latencyMs: 0,
        })),
      },
    };

    const view = buildStatusViewModel(data);
    expect(view.overall).toBe(overall);
    expect(view.sourceState).toBe(sourceState);
  });

  it("keeps a named loading state for the Suspense fallback", () => {
    expect(STATUS_LOADING_LABEL).toBe("A carregar…");
  });

  it("prefers the server-only status base URL for production-like fixture runs", () => {
    expect(statusBaseUrl({
      NODE_ENV: "production",
      LUMES_STATUS_BASE_URL: "http://127.0.0.1:4413",
      NEXT_PUBLIC_BASE_URL: "https://lumes.pt",
    })).toBe("http://127.0.0.1:4413");
  });

  it("loads all server-side status endpoints through an absolute, no-store request boundary", async () => {
    const fetcher = async (input: string, init?: RequestInit): Promise<Response> => {
      expect(input.startsWith("http://127.0.0.1:4411")).toBe(true);
      expect(init).toMatchObject({ cache: "no-store" });

      if (input.endsWith("/api/health")) {
        return new Response(JSON.stringify({
          status: "ok", timestamp: "2026-07-12T00:00:00.000Z", uptime_s: 10, latencyMs: 2,
          checks: { database: "ok" }, lastIncidentUpdate: null,
        }), { status: 200 });
      }
      if (input.endsWith("/api/stats")) {
        return new Response(JSON.stringify({ total: 4, active: 1, resolved: 3, snapshots: 2 }), { status: 200 });
      }
      return new Response(JSON.stringify({ sources: [{
        sourceId: "anepc", sourceName: "ANEPC", status: "ok", lastSuccess: null,
        lastError: null, recordCount: 4, latencyMs: 8,
      }] }), { status: 200 });
    };

    const data = await loadStatusPageData(fetcher, { NODE_ENV: "test", PORT: "4411" });
    expect(data.health.status).toBe("ok");
    expect(data.stats.total).toBe(4);
    expect(data.sources.sources).toHaveLength(1);
  });

  it("converts non-OK and thrown upstream responses into deterministic fallback data", async () => {
    const fetcher = async (input: string): Promise<Response> => {
      if (input.endsWith("/api/stats")) return new Response("upstream unavailable", { status: 503 });
      throw new Error("private upstream detail");
    };

    const data = await loadStatusPageData(fetcher, { NODE_ENV: "test", PORT: "4412" });
    expect(data.health.status).toBe("degraded");
    expect(data.stats).toEqual({ total: 0, active: 0, resolved: 0, snapshots: 0 });
    expect(data.sources.sources).toEqual([]);
  });
});
