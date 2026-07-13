import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/api/cache";

const { getSyntheticBiomassGrid, gridInBbox } = vi.hoisted(() => ({
  getSyntheticBiomassGrid: vi.fn(),
  gridInBbox: vi.fn(),
}));

vi.mock("@/lib/biomass/synthetic-grid", () => ({ getSyntheticBiomassGrid, gridInBbox }));

import { GET } from "@/app/api/biomass/grid/route";
import { NextRequest } from "next/server";

describe("biomass grid route contract", () => {
  beforeEach(() => {
    invalidate();
    vi.clearAllMocks();
    getSyntheticBiomassGrid.mockReturnValue([]);
    gridInBbox.mockReturnValue([]);
  });

  it("redacts grid-loader failures and prevents caching", async () => {
    getSyntheticBiomassGrid.mockImplementationOnce(() => {
      throw new Error("private biomass grid detail");
    });

    const response = await GET(new NextRequest("http://localhost/api/biomass/grid?bbox=-9.5,36.95,-6,42.15"));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      type: "FeatureCollection",
      cellCount: 0,
      features: [],
      dataState: { state: "retryable-error", source: "synthetic-biomass" },
    });
    expect(JSON.stringify(payload)).not.toContain("private biomass grid detail");
  });

  it("returns an explicit empty state for a reachable bbox without cells", async () => {
    const response = await GET(new NextRequest("http://localhost/api/biomass/grid?bbox=-9.5,36.95,-6,42.15"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(payload).toMatchObject({
      type: "FeatureCollection",
      cellCount: 0,
      features: [],
      dataState: { state: "empty", source: "synthetic-biomass" },
    });
  });

  it("serializes populated grid cells with the stable feature properties", async () => {
    gridInBbox.mockReturnValueOnce([{
      id: "cell-1",
      lat: 38.72,
      lon: -9.14,
      dominantSpecies: "maritime_pine",
      tonsPerHectare: 12,
      profile: { pt: "Pinheiro bravo", rateOfSpread: "high", fuelModel: "timber" },
    }]);

    const response = await GET(new NextRequest("http://localhost/api/biomass/grid?bbox=-9.5,36.95,-6,42.15"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      cellCount: 1,
      dataState: { state: "healthy", source: "synthetic-biomass" },
      features: [{
        geometry: { coordinates: [-9.14, 38.72] },
        properties: {
          tonsPerHectare: 12,
          species: "maritime_pine",
          speciesLabel: "Pinheiro bravo",
          rateOfSpread: "high",
          fuelModel: "timber",
        },
      }],
    });
  });
});
