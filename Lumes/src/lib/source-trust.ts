import type { DataTrustState } from "@/lib/data-trust";
import type { DataState } from "@/lib/data-state";

export type SourceTier = "core" | "optional";
export type SourceTrustStatus = "healthy" | "stale" | "fallback" | "error" | "disabled";

export interface SourceTrust {
  sourceId: string;
  tier: SourceTier;
  state: SourceTrustStatus;
  reason: string | null;
  sourceUpdatedAt: string | null;
}

/** Core incident fetch state must not be hidden by a healthy auxiliary probe. */
export function prioritizeLiveTrust(
  liveState: DataTrustState["state"],
  sourceState: DataTrustState["state"] | DataState,
): DataTrustState["state"] {
  if (liveState !== "fresh" && liveState !== "updating") return liveState;
  if (sourceState === "retryable-error") return "error";
  if (sourceState === "healthy") return "fresh";
  return sourceState;
}

const CORE_SOURCE_IDS = new Set([
  "anepc-prociv-arcgis",
  "anepc-regional-commands",
  "ipma-fire-risk",
  "ipma-weather",
  "ipma-warnings",
]);

/** Classifies an upstream source by whether it can support the main situation headline. */
export function classifySource(sourceId: string): SourceTier {
  return CORE_SOURCE_IDS.has(sourceId) ? "core" : "optional";
}

function latestTimestamp(sources: SourceTrust[]): string | null {
  return sources
    .map((source) => source.sourceUpdatedAt)
    .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function headlineState(sources: SourceTrust[]): DataTrustState["state"] {
  if (sources.length === 0 || sources.every((source) => source.state === "disabled")) return "empty";
  if (sources.some((source) => source.state === "error" || source.state === "disabled")) return "error";
  if (sources.some((source) => source.state === "fallback")) return "fallback";
  if (sources.some((source) => source.state === "stale")) return "stale";
  return "fresh";
}

/** Derives the public headline trust from core sources only. */
export function deriveHeadlineTrust(sources: SourceTrust[]): DataTrustState {
  const coreSources = sources.filter((source) => source.tier === "core");
  const state = headlineState(coreSources);
  const problemSource = coreSources.find((source) =>
    state === "error"
      ? source.state === "error" || source.state === "disabled"
      : state === "fallback"
        ? source.state === "fallback"
        : state === "stale"
          ? source.state === "stale"
          : false,
  );

  return {
    state,
    source: "core",
    sourceUpdatedAt: latestTimestamp(coreSources),
    observedAt: new Date().toISOString(),
    reason: problemSource?.reason ?? null,
  };
}
