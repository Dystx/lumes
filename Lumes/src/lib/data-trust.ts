import type { DataStateMeta } from "@/lib/data-state";

export type DataTrustStatus = "fresh" | "updating" | "fallback" | "stale" | "empty" | "error";

export interface DataTrustState {
  state: DataTrustStatus;
  source: string;
  sourceUpdatedAt: string | null;
  observedAt: string;
  reason: string | null;
}

export interface DataTrustInput {
  meta?: DataStateMeta | null;
  observedAt: Date;
  source: string;
  loading: boolean;
  error: string | null;
}

/** Converts API and client-fetch state into one safe UI trust signal. */
export function deriveDataTrust(input: DataTrustInput): DataTrustState {
  const apiState = input.meta?.state;
  const state: DataTrustStatus = apiState === "fallback"
    ? "fallback"
    : apiState === "stale"
      ? "stale"
      : apiState === "empty"
        ? "empty"
        : apiState === "retryable-error"
          ? "error"
          : input.error
            ? "error"
            : input.loading && !input.meta
              ? "updating"
              : "fresh";

  return {
    state,
    source: input.meta?.source ?? input.source,
    sourceUpdatedAt: input.meta?.sourceUpdatedAt ?? input.meta?.updatedAt ?? null,
    observedAt: input.observedAt.toISOString(),
    reason: input.meta?.reason ?? (state === "error" ? "Unable to refresh this data" : null),
  };
}
