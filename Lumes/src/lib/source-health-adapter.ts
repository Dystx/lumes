import type { DataState } from "@/lib/data-state";
import type { DataTrustState } from "@/lib/data-trust";
import { classifySource, type SourceTrust } from "@/lib/source-trust";
import type { SourceHealth } from "@/lib/types";

/** Normalize the API source-health DTO before it enters the headline trust model. */
export function sourceHealthToTrust(source: SourceHealth): SourceTrust {
  const state = source.state
    ?? (source.status === "ok"
      ? "healthy"
      : source.status === "stale"
        ? "stale"
        : source.status === "disabled"
          ? "disabled"
          : "error");

  return {
    sourceId: source.sourceId,
    tier: source.tier ?? classifySource(source.sourceId),
    state,
    reason: source.lastError,
    sourceUpdatedAt: source.sourceUpdatedAt ?? null,
  };
}

/** Map internal headline trust terminology to the public data-state contract. */
export function headlineTrustToDataState(
  state: DataTrustState["state"],
): DataState {
  if (state === "fresh" || state === "updating") return "healthy";
  if (state === "error") return "retryable-error";
  return state;
}
