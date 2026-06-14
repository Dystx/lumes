import { describe, it, expect } from "vitest";
import {
  spacingGridSlop,
  spacingEntropySlop,
} from "../../src/math/spacing.js";
import {
  typographyScaleSlop,
  headingHierarchySlop,
} from "../../src/math/typography.js";
import {
  relativeLuminance,
  contrastRatio,
  contrastSlop,
  parseColor,
} from "../../src/math/contrast.js";
import { zIndexSlop } from "../../src/math/zIndex.js";
import { aspectRatioSlop } from "../../src/math/proportions.js";

describe("spacing math", () => {
  it("returns 0 for on-grid values", () => {
    expect(spacingGridSlop(16, 4)).toBe(0);
    expect(spacingGridSlop(0, 4)).toBe(0);
  });

  it("returns max slop for worst off-grid values", () => {
    expect(spacingGridSlop(14, 4)).toBe(1);
  });

  it("returns fractional slop for partially off-grid values", () => {
    expect(spacingGridSlop(13, 4)).toBe(0.5);
    expect(spacingGridSlop(-13, 4)).toBe(0.5);
  });

  it("guards NaN and Infinity inputs", () => {
    expect(spacingGridSlop(NaN, 4)).toBe(0);
    expect(spacingGridSlop(Infinity, 4)).toBe(0);
    expect(spacingGridSlop(16, NaN)).toBe(0);
    expect(spacingGridSlop(16, 0)).toBe(0);
  });
});

describe("spacing entropy", () => {
  it("returns 0 for repeated values", () => {
    expect(spacingEntropySlop([4, 4, 4])).toBe(0);
  });

  it("returns 1 for all unique values", () => {
    expect(spacingEntropySlop([1, 2, 3, 4])).toBe(1);
  });

  it("returns an intermediate value for mixed values", () => {
    const slop = spacingEntropySlop([4, 4, 4, 8]);
    expect(slop).toBeGreaterThan(0);
    expect(slop).toBeLessThan(1);
  });

  it("ignores non-finite values", () => {
    expect(spacingEntropySlop([NaN, Infinity, 4, 4])).toBe(0);
  });
});

describe("typography scale", () => {
  it("returns 0 for a clean modular scale", () => {
    const sizes = [12, 14.4, 17.28, 20.736, 24.8832];
    expect(typographyScaleSlop(sizes, 1.2)).toBe(0);
  });

  it("returns a high value for inconsistent sizes", () => {
    const sizes = [12, 14, 16, 18, 22, 30];
    const slop = typographyScaleSlop(sizes, 1.2);
    expect(slop).toBeGreaterThan(0);
    expect(slop).toBeLessThanOrEqual(1);
  });

  it("returns 0 when fewer than 2 sizes are provided", () => {
    expect(typographyScaleSlop([12], 1.2)).toBe(0);
    expect(typographyScaleSlop([], 1.2)).toBe(0);
  });

  it("returns 0 for invalid target ratio", () => {
    expect(typographyScaleSlop([12, 14], 0)).toBe(0);
  });
});

describe("heading hierarchy", () => {
  it("returns 0 for no inversion", () => {
    const headings = [
      { level: 1, fontSize: 32 },
      { level: 2, fontSize: 24 },
      { level: 3, fontSize: 18 },
    ];
    expect(headingHierarchySlop(headings)).toBe(0);
  });

  it("detects inverted hierarchy", () => {
    const headings = [
      { level: 1, fontSize: 18 },
      { level: 2, fontSize: 32 },
    ];
    expect(headingHierarchySlop(headings)).toBe(1);
  });

  it("returns 0 for fewer than 2 headings", () => {
    expect(headingHierarchySlop([{ level: 1, fontSize: 32 }])).toBe(0);
  });
});

describe("contrast", () => {
  it("calculates relative luminance for black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("calculates contrast ratio between black and white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 0 slop for ratios meeting the target", () => {
    expect(contrastSlop(7, 4.5)).toBe(0);
    expect(contrastSlop(4.5, 4.5)).toBe(0);
  });

  it("returns medium slop for half the target ratio", () => {
    expect(contrastSlop(2.25, 4.5)).toBeCloseTo(0.5, 5);
  });

  it("parses hex, rgb, hsl, and oklch inputs", () => {
    const hex = parseColor("#ff0000");
    expect(hex).toEqual({ r: 255, g: 0, b: 0 });

    const rgb = parseColor("rgb(0, 128, 0)");
    expect(rgb).toEqual({ r: 0, g: 128, b: 0 });

    const hsl = parseColor("hsl(240, 100%, 50%)");
    expect(hsl?.r).toBeCloseTo(0, 0);
    expect(hsl?.b).toBeCloseTo(255, 0);

    const oklch = parseColor("oklch(60% 0.2 250)");
    expect(oklch).toBeDefined();
  });
});

describe("z-index", () => {
  it("returns 0 for values on the default scale", () => {
    expect(zIndexSlop(10)).toBe(0);
    expect(zIndexSlop([0, 10, 50])).toBe(0);
  });

  it("returns near 0 for values close to the scale", () => {
    expect(zIndexSlop(11)).toBeCloseTo(0.001, 3);
    expect(zIndexSlop(-1)).toBeCloseTo(0.001, 3);
  });

  it("returns 1 for extreme arbitrary values", () => {
    expect(zIndexSlop(9999)).toBe(1);
  });

  it("ignores non-finite values", () => {
    expect(zIndexSlop(NaN)).toBe(0);
  });
});

describe("proportions", () => {
  it("returns 0 as a stub", () => {
    expect(aspectRatioSlop(800, 600)).toBe(0);
    expect(aspectRatioSlop(800, 600, [4 / 3, 16 / 9])).toBe(0);
  });
});
