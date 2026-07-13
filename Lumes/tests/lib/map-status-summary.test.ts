import { describe, expect, it } from "vitest";
import { buildMapStatusSummary, countIncidentSeverities } from "@/lib/map-status-summary";

describe("map status summary", () => {
  it("counts visible incidents by severity in the documented order", () => {
    expect(countIncidentSeverities([
      { severity: "high" },
      { severity: "critical" },
      { severity: "high" },
      { severity: "low" },
    ])).toEqual({ critical: 1, high: 2, medium: 0, low: 1 });
  });

  it("formats a Portuguese summary with plural severity labels", () => {
    const summary = buildMapStatusSummary({
      lang: "pt",
      visibleCount: 6,
      severityCounts: { critical: 2, high: 3, medium: 1, low: 0 },
    });

    expect(summary.headline).toBe("O mapa mostra 6 incidentes");
    expect(summary.breakdown).toBe("2 críticos · 3 elevados · 1 médio");
    expect(summary.ariaLabel).toBe("O mapa mostra 6 incidentes: 2 críticos · 3 elevados · 1 médio");
  });

  it("uses filtered English copy and singular incident wording", () => {
    const summary = buildMapStatusSummary({
      lang: "en",
      visibleCount: 1,
      activeFilterCount: 2,
      severityCounts: { critical: 1 },
    });

    expect(summary.headline).toBe("Showing 1 incident");
    expect(summary.breakdown).toBe("1 critical");
    expect(summary.activeFilterLabel).toBe("2 active filters");
  });

  it("returns an explicit no-match message when filters hide every incident", () => {
    const summary = buildMapStatusSummary({
      lang: "pt",
      visibleCount: 0,
      activeFilterCount: 1,
      severityCounts: {},
    });

    expect(summary.breakdown).toBe("");
    expect(summary.emptyMessage).toBe("Nenhum incidente corresponde aos filtros");
    expect(summary.ariaLabel).toBe("A mostrar 0 incidentes: Nenhum incidente corresponde aos filtros");
  });

  it("omits zero-count severity categories", () => {
    const summary = buildMapStatusSummary({
      lang: "en",
      visibleCount: 2,
      severityCounts: { critical: 0, high: 2, medium: 0, low: 0 },
    });

    expect(summary.segments).toEqual([{ severity: "high", count: 2, label: "high" }]);
  });
});
