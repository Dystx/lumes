import { describe, expect, it } from "vitest";
import { classifySource, deriveHeadlineTrust, prioritizeLiveTrust, type SourceTrust } from "@/lib/source-trust";

const source = (
  sourceId: string,
  state: SourceTrust["state"],
  sourceUpdatedAt = "2026-07-11T10:00:00.000Z",
): SourceTrust => ({
  sourceId,
  tier: classifySource(sourceId),
  state,
  reason: null,
  sourceUpdatedAt,
});

describe("source trust", () => {
  it("classifies operational sources as core and enrichment layers as optional", () => {
    expect(classifySource("anepc-prociv-arcgis")).toBe("core");
    expect(classifySource("ipma-fire-risk")).toBe("core");
    expect(classifySource("ipma-weather")).toBe("core");
    expect(classifySource("ipma-warnings")).toBe("core");
    expect(classifySource("anepc-regional-commands")).toBe("core");
    expect(classifySource("nasa-firms-viirs")).toBe("optional");
    expect(classifySource("osm-fire-stations")).toBe("optional");
    expect(classifySource("aerial-adsb")).toBe("optional");
    expect(classifySource("biomass")).toBe("optional");
  });

  it("keeps headline trust fresh when only optional FIRMS is unavailable", () => {
    const trust = deriveHeadlineTrust([
      source("anepc-prociv-arcgis", "healthy"),
      source("ipma-fire-risk", "healthy"),
      source("ipma-weather", "healthy"),
      source("nasa-firms-viirs", "error"),
    ]);

    expect(trust.state).toBe("fresh");
    expect(trust.reason).toBeNull();
    expect(trust.source).toBe("core");
  });

  it("marks the headline retryable when the ANEPC core source fails", () => {
    const trust = deriveHeadlineTrust([
      { ...source("anepc-prociv-arcgis", "error"), reason: "ANEPC unavailable" },
      source("ipma-fire-risk", "healthy"),
      source("ipma-weather", "healthy"),
    ]);

    expect(trust.state).toBe("error");
    expect(trust.reason).toBe("ANEPC unavailable");
    expect(trust.source).toBe("core");
  });

  it("uses the newest core source timestamp for the headline", () => {
    const trust = deriveHeadlineTrust([
      source("anepc-prociv-arcgis", "healthy", "2026-07-11T09:00:00.000Z"),
      source("ipma-weather", "healthy", "2026-07-11T10:15:00.000Z"),
    ]);

    expect(trust.sourceUpdatedAt).toBe("2026-07-11T10:15:00.000Z");
  });

  it("preserves stale and empty core states for the headline", () => {
    expect(deriveHeadlineTrust([
      source("anepc-prociv-arcgis", "stale"),
      source("ipma-fire-risk", "healthy"),
    ])).toMatchObject({ state: "stale" });

    expect(deriveHeadlineTrust([
      source("anepc-prociv-arcgis", "disabled"),
      source("ipma-fire-risk", "disabled"),
    ])).toMatchObject({ state: "empty" });
  });

  it("does not hide a live incident fallback behind healthy auxiliary probes", () => {
    expect(prioritizeLiveTrust("fallback", "fresh")).toBe("fallback");
    expect(prioritizeLiveTrust("stale", "fresh")).toBe("stale");
    expect(prioritizeLiveTrust("fresh", "stale")).toBe("stale");
  });
});
