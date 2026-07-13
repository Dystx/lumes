import { describe, expect, it } from "vitest";
import {
  DARK_STYLE,
  LIGHT_STYLE,
  SATELLITE_LAYER_ID,
  SATELLITE_SOURCE_ID,
  SATELLITE_TILES,
  SOURCE_COLORS,
  normalizeMapTheme,
  pickStyle,
  pickWaterColor,
} from "@/lib/map/map-style";

describe("map style policy", () => {
  it("uses the dark style as the satellite base and respects the theme", () => {
    expect(pickStyle("dark", "dark")).toBe(DARK_STYLE);
    expect(pickStyle("light", "dark")).toBe(LIGHT_STYLE);
    expect(pickStyle("dark", "light")).toBe(LIGHT_STYLE);
    expect(pickStyle("satellite", "light")).toBe(DARK_STYLE);
    expect(pickStyle("sat", "dark")).toBe(DARK_STYLE);
  });

  it("keeps water colors deterministic for each theme and basemap", () => {
    expect(pickWaterColor("dark", "dark")).toBe("#0a2540");
    expect(pickWaterColor("light", "light")).toBe("#a8c8e8");
    expect(pickWaterColor("dark", "satellite")).toBe("#1e3a5f");
    expect(pickWaterColor("light", "satellite")).toBe("#bcd4e6");
  });

  it("keeps the satellite contract and source colors available to the map", () => {
    expect(SATELLITE_SOURCE_ID).toBe("eox-s2cloudless");
    expect(SATELLITE_LAYER_ID).toBe("eox-s2cloudless-bg");
    expect(SATELLITE_TILES).toContain("s2cloudless-2020_3857");
    expect(SOURCE_COLORS.dark.official).toBe("#ff6b5b");
    expect(SOURCE_COLORS.light.evacuation).toBe("#c0392b");
  });

  it("normalizes next-themes values at the MapScene boundary", () => {
    expect(normalizeMapTheme("dark")).toBe("dark");
    expect(normalizeMapTheme("light")).toBe("light");
    expect(normalizeMapTheme(undefined)).toBe("dark");
    expect(normalizeMapTheme("system")).toBe("dark");
  });
});
