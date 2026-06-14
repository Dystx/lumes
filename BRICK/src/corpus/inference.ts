import { readFileSync } from "node:fs";
import baseline from "../../corpus/baseline.json" with { type: "json" };

export interface CorpusProfile {
  version: string;
  generatedAt: string;
  sampleCount: number;
  spacingHistogram: Record<string, number>;
  fontSizeHistogram: Record<string, number>;
  colorHistogram: Record<string, number>;
}

const DEFAULT_THRESHOLD = 0;

let cachedProfile: CorpusProfile | undefined;

export function loadCorpusProfile(path?: string): CorpusProfile {
  if (cachedProfile && !path) return cachedProfile;

  if (!path) {
    cachedProfile = baseline as CorpusProfile;
    return cachedProfile;
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as CorpusProfile;
    return parsed;
  } catch {
    return {
      version: "0.0.0",
      generatedAt: new Date().toISOString(),
      sampleCount: 0,
      spacingHistogram: {},
      fontSizeHistogram: {},
      colorHistogram: {},
    };
  }
}

export function isCommonSpacing(valuePx: number, threshold = DEFAULT_THRESHOLD): boolean {
  const profile = loadCorpusProfile();
  const count = profile.spacingHistogram[String(valuePx)] ?? 0;
  return count > threshold;
}

export function isCommonFontSize(valuePx: number, threshold = DEFAULT_THRESHOLD): boolean {
  const profile = loadCorpusProfile();
  const count = profile.fontSizeHistogram[String(valuePx)] ?? 0;
  return count > threshold;
}

export function isCommonColor(color: string, threshold = DEFAULT_THRESHOLD): boolean {
  const profile = loadCorpusProfile();
  const normalized = color.toLowerCase();
  const count = profile.colorHistogram[normalized] ?? 0;
  return count > threshold;
}
