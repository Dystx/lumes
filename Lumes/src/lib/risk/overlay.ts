export type RiskOverlayCategory = "low" | "moderate" | "high" | "very_high" | "extreme";

export interface RiskOverlaySnapshot {
  score: number;
  category: RiskOverlayCategory;
  fetchedAt: string;
  ignition: number;
  intensity: number;
}

export type RiskOverlayNormalization =
  | { state: "healthy"; snapshot: RiskOverlaySnapshot }
  | { state: "empty"; reason: string }
  | { state: "invalid"; reason: string };

const CATEGORIES: ReadonlySet<RiskOverlayCategory> = new Set([
  "low",
  "moderate",
  "high",
  "very_high",
  "extreme",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bounded(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function safeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : fallback;
}

function isCategory(value: unknown): value is RiskOverlayCategory {
  return typeof value === "string" && CATEGORIES.has(value as RiskOverlayCategory);
}

/**
 * Converts the public `/api/risk` envelope into the only shape the map chip
 * can render. Invalid provider data is never allowed to become a misleading
 * marker or score.
 */
export function normalizeRiskOverlayResponse(
  value: unknown,
  fallbackFetchedAt: string,
): RiskOverlayNormalization {
  if (!isRecord(value)) return { state: "invalid", reason: "Risk response was malformed" };

  const dataState = isRecord(value.dataState) ? value.dataState : null;
  if (dataState?.state === "empty") {
    return {
      state: "empty",
      reason: typeof dataState.reason === "string" ? dataState.reason : "No risk data",
    };
  }

  const risk = isRecord(value.risk) ? value.risk : null;
  const score = bounded(risk?.score, 0, 100);
  const ignition = bounded(risk?.ignitionLikelihood, 0, 1);
  const intensity = bounded(risk?.intensityPotential, 0, 1);
  if (score === null || ignition === null || intensity === null || !isCategory(risk?.category)) {
    return { state: "invalid", reason: "Risk response was malformed" };
  }

  return {
    state: "healthy",
    snapshot: {
      score,
      category: risk.category,
      fetchedAt: safeTimestamp(value.fetchedAt, fallbackFetchedAt),
      ignition,
      intensity,
    },
  };
}
