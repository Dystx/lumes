import { normalizeDataStateMeta, type DataStateMeta } from "@/lib/data-state";

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

export function dataStateToTrustStatus(state: DataStateMeta["state"]): DataTrustStatus {
  switch (state) {
    case "fallback":
      return "fallback";
    case "stale":
      return "stale";
    case "empty":
      return "empty";
    case "retryable-error":
      return "error";
    default:
      return "fresh";
  }
}

/** Converts API and client-fetch state into one safe UI trust signal. */
export function deriveDataTrust(input: DataTrustInput): DataTrustState {
  const normalizedMeta = input.meta ? normalizeDataStateMeta(input.meta) : null;
  const invalidMeta = input.meta !== null && input.meta !== undefined && normalizedMeta === null;
  const apiState = normalizedMeta?.state;
  // A retained fallback is an explicit, usable degraded state. Other
  // metadata states must not mask a failed refresh, especially `healthy`
  // metadata from a response that settled with an error.
  const refreshFailed = Boolean(input.error) && apiState !== "fallback";
  const state: DataTrustStatus = invalidMeta
    ? "error"
    : refreshFailed
    ? "error"
    : apiState
    ? dataStateToTrustStatus(apiState)
    : input.error
      ? "error"
      : input.loading && !input.meta
        ? "updating"
        : "fresh";

  return {
    state,
    source: normalizedMeta?.source ?? input.source,
    sourceUpdatedAt: normalizedMeta?.sourceUpdatedAt ?? null,
    observedAt: input.observedAt.toISOString(),
    reason: invalidMeta
      ? "Invalid data state metadata"
      : normalizedMeta?.reason ?? (state === "error" ? "Unable to refresh this data" : null),
  };
}
