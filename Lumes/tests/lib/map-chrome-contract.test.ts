import { describe, expect, it } from "vitest";
import { deriveMapChromeInsets, rectanglesOverlap } from "@/lib/map-chrome";

describe("map chrome inset contract", () => {
  it("reserves the right rail and open drawer on wide layouts", () => {
    expect(deriveMapChromeInsets({
      mode: "wide",
      exploreOpen: false,
      drawerWidth: 360,
      sheetHeight: 0,
      safeAreaBottom: 0,
    })).toEqual({ top: 80, right: 48, bottom: 0, left: 24 });

    expect(deriveMapChromeInsets({
      mode: "wide",
      exploreOpen: true,
      drawerWidth: 360,
      sheetHeight: 0,
      safeAreaBottom: 0,
    })).toEqual({ top: 80, right: 424, bottom: 0, left: 24 });
  });

  it("reserves compact drawer and sheet space without changing the phone map", () => {
    expect(deriveMapChromeInsets({
      mode: "tablet",
      exploreOpen: true,
      drawerWidth: 360,
      sheetHeight: 56,
      safeAreaBottom: 12,
    })).toEqual({ top: 64, right: 376, bottom: 68, left: 16 });

    expect(deriveMapChromeInsets({
      mode: "phone",
      exploreOpen: false,
      drawerWidth: 360,
      sheetHeight: 96,
      safeAreaBottom: 24,
    })).toEqual({ top: 16, right: 16, bottom: 120, left: 16 });
  });

  it("detects chrome rectangles that would occupy the drawer", () => {
    expect(rectanglesOverlap(
      { left: 700, top: 80, right: 900, bottom: 160 },
      { left: 872, top: 0, right: 1232, bottom: 800 },
    )).toBe(true);
    expect(rectanglesOverlap(
      { left: 600, top: 80, right: 840, bottom: 160 },
      { left: 872, top: 0, right: 1232, bottom: 800 },
    )).toBe(false);
  });
});
