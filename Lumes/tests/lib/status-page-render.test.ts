import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusPageView, type StatusPageViewModel } from "@/app/status/page";

function view(overrides: Partial<StatusPageViewModel> = {}): StatusPageViewModel {
  return {
    health: {
      status: "ok",
      timestamp: "2026-07-12T00:00:00.000Z",
      uptime_s: 10,
      latencyMs: 2,
      checks: { database: "ok" },
      lastIncidentUpdate: null,
    },
    stats: { total: 12, active: 3, resolved: 9, snapshots: 4 },
    sources: {
      sources: [{
        sourceId: "anepc",
        sourceName: "ANEPC",
        status: "ok",
        lastSuccess: null,
        lastError: null,
        recordCount: 12,
        latencyMs: 8,
      }],
    },
    overall: "ok",
    sourceState: "available",
    ...overrides,
  };
}

describe("status page rendered-state contract", () => {
  it("renders the healthy state and source evidence", () => {
    const html = renderToStaticMarkup(createElement(StatusPageView, { view: view() }));

    expect(html).toContain('data-status-state="ok"');
    expect(html).toContain('data-status-sources-state="available"');
    expect(html).toContain("Tudo operacional");
    expect(html).toContain("ANEPC");
    expect(html).toContain("12");
  });

  it("renders degraded empty-source state without inventing source rows", () => {
    const healthy = view();
    const html = renderToStaticMarkup(createElement(StatusPageView, {
      view: view({
        health: { ...healthy.health, status: "degraded" },
        sources: { sources: [] },
        overall: "degraded",
        sourceState: "empty",
      }),
    }));

    expect(html).toContain('data-status-state="degraded"');
    expect(html).toContain('data-status-sources-state="empty"');
    expect(html).toContain("Operação degradada");
    expect(html).toContain("Não foi possível confirmar o estado das fontes");
    expect(html).not.toContain("ANEPC");
  });

  it("renders disabled sources without converting null latency to zero", () => {
    const html = renderToStaticMarkup(createElement(StatusPageView, {
      view: view({
        sources: {
          sources: [{
            sourceId: "aerial-adsb",
            sourceName: "Aerial activity",
            status: "disabled",
            lastSuccess: null,
            lastError: "Loaded on demand",
            recordCount: 0,
            latencyMs: null,
          }],
        },
      }),
    }));

    expect(html).toContain("desativado");
    expect(html).toContain("—");
    expect(html).not.toContain("0 ms");
  });

  it("renders malformed incident timestamps as unavailable", () => {
    const healthy = view();
    const html = renderToStaticMarkup(createElement(StatusPageView, {
      view: view({
        health: { ...healthy.health, lastIncidentUpdate: "not-a-date" },
      }),
    }));

    expect(html).not.toContain("Invalid Date");
    expect(html).toContain("—");
  });
});
