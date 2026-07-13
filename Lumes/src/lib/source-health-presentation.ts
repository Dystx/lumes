import type { DataState, DataStateMeta } from "@/lib/data-state";
import type { DataTrustState } from "@/lib/data-trust";
import { headlineTrustToDataState } from "@/lib/source-health-adapter";
import { prioritizeLiveTrust } from "@/lib/source-trust";
import type { Language } from "@/lib/i18n";
import type { SourceHealth } from "@/lib/types";

export interface SourceHealthPresentationInput {
  sources: readonly SourceHealth[];
  headlineTrust: DataTrustState;
  sourceDataState: DataStateMeta | null | undefined;
  sourceError: string | null;
  liveTrust: DataTrustState;
  lang: Language;
}

export interface SourceHealthPresentation {
  state: DataState;
  reason?: string;
  optionalLayerWarning?: string;
}

function liveTrustDataState(state: DataTrustState["state"]): DataState | null {
  if (state === "fallback" || state === "stale" || state === "empty") return state;
  if (state === "error") return "retryable-error";
  return null;
}

function optionalLayerWarning(sources: readonly SourceHealth[], lang: Language): string | undefined {
  const unavailable = sources
    .filter((source) => source.tier === "optional" && (
      source.state === "error"
      || source.state === "disabled"
      || source.dataState === "retryable-error"
    ))
    .map((source) => source.sourceId);
  if (unavailable.length === 0) return undefined;
  return lang === "pt"
    ? `Camada opcional indisponível: ${unavailable.join(", ")}`
    : `Optional layer unavailable: ${unavailable.join(", ")}`;
}

export function buildSourceHealthPresentation({
  sources,
  headlineTrust,
  sourceDataState,
  sourceError,
  liveTrust,
  lang,
}: SourceHealthPresentationInput): SourceHealthPresentation {
  const secondaryState = sources.length > 0
    ? headlineTrust.state
    : liveTrustDataState(liveTrust.state)
      ?? sourceDataState?.state
      ?? (sourceError ? "error" : "fresh");
  const state = headlineTrustToDataState(
    prioritizeLiveTrust(liveTrust.state, secondaryState),
  );
  const reason = liveTrust.state !== "fresh"
    ? liveTrust.reason ?? undefined
    : headlineTrust.reason
      ?? sourceDataState?.reason
      ?? (sourceError
        ? lang === "pt" ? "Não foi possível verificar as fontes." : "Source health could not be checked."
        : undefined);

  return {
    state,
    reason,
    optionalLayerWarning: optionalLayerWarning(sources, lang),
  };
}
