import { describe, expect, it, vi } from "vitest";
import { setGeoJSONSourceData } from "@/lib/map/map-source";

const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

describe("MapLibre GeoJSON source updater", () => {
  it("updates a GeoJSON source and reports success", () => {
    const setData = vi.fn();
    const map = { getSource: vi.fn(() => ({ type: "geojson", setData })) };

    expect(setGeoJSONSourceData(map, "incidents", data)).toBe(true);
    expect(setData).toHaveBeenCalledWith(data);
  });

  it("fails closed when the source is missing or not GeoJSON", () => {
    const setData = vi.fn();
    const missing = { getSource: vi.fn(() => undefined) };
    const wrongType = { getSource: vi.fn(() => ({ type: "vector", setData })) };

    expect(setGeoJSONSourceData(missing, "incidents", data)).toBe(false);
    expect(setGeoJSONSourceData(wrongType, "incidents", data)).toBe(false);
    expect(setData).not.toHaveBeenCalled();
  });

  it("fails closed when a GeoJSON source has no update method", () => {
    const map = { getSource: vi.fn(() => ({ type: "geojson" })) };

    expect(setGeoJSONSourceData(map, "incidents", data)).toBe(false);
  });
});
