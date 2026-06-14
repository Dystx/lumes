import { describe, it, expect } from "vitest";
import {
  isCommonSpacing,
  isCommonFontSize,
  isCommonColor,
  loadCorpusProfile,
} from "../../src/corpus/inference";
import { join } from "node:path";

describe("corpus inference", () => {
  it("identifies common spacing values from the baseline", () => {
    // 13 appears twice in corpus/baseline.json, so it is common with threshold 1.
    expect(isCommonSpacing(13)).toBe(true);
    expect(isCommonSpacing(42)).toBe(false);
  });

  it("identifies common font sizes from the baseline", () => {
    expect(isCommonFontSize(13)).toBe(true);
    expect(isCommonFontSize(99)).toBe(false);
  });

  it("identifies common colors from the baseline", () => {
    expect(isCommonColor("#ff0000")).toBe(true);
    expect(isCommonColor("#123456")).toBe(false);
  });

  it("loads the shipped baseline corpus", () => {
    const profile = loadCorpusProfile(join(__dirname, "../../corpus/baseline.json"));
    expect(profile.sampleCount).toBeGreaterThan(0);
    expect(Object.keys(profile.spacingHistogram).length).toBeGreaterThan(0);
  });

  it("falls back gracefully for a missing corpus file", () => {
    const profile = loadCorpusProfile(join(__dirname, "missing-corpus.json"));
    expect(profile.sampleCount).toBe(0);
    expect(isCommonSpacing(16, 1)).toBe(false);
  });
});
