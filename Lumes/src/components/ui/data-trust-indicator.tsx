import type { DataTrustStatus } from "@/lib/data-trust";

export type TrustIndicatorState = DataTrustStatus | "healthy" | "retryable-error";

function normalizedState(state: TrustIndicatorState): DataTrustStatus {
  if (state === "healthy") return "fresh";
  if (state === "retryable-error") return "error";
  return state;
}

export function trustIndicatorLabel(state: TrustIndicatorState, lang: "pt" | "en"): string {
  switch (normalizedState(state)) {
    case "fallback": return lang === "pt" ? "Dados alternativos" : "Fallback data";
    case "stale": return lang === "pt" ? "Dados desatualizados" : "Stale data";
    case "empty": return lang === "pt" ? "Sem dados" : "No data";
    case "error": return lang === "pt" ? "A tentar novamente" : "Retrying";
    case "updating": return lang === "pt" ? "A atualizar" : "Updating";
    case "fresh": return lang === "pt" ? "Atualizado" : "Updated";
  }
}

export function DataTrustIndicator({
  state,
  lang,
  reason,
  compact = false,
}: {
  state: TrustIndicatorState;
  lang: "pt" | "en";
  reason?: string | null;
  compact?: boolean;
}) {
  const current = normalizedState(state);
  const healthy = current === "fresh";
  return (
    <span
      data-testid="data-trust-indicator"
      data-trust-state={current}
      title={reason ?? undefined}
      aria-label={`${lang === "pt" ? "Estado dos dados" : "Data status"}: ${trustIndicatorLabel(state, lang)}`}
      className={`inline-flex items-center gap-1.5 font-medium uppercase tracking-wider ${compact ? "max-w-24 truncate text-meta" : "text-meta"} ${healthy ? "text-[var(--ember-success)]" : current === "updating" ? "text-[var(--ember-info)]" : "text-[var(--ember-warning)]"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-[var(--ember-success)]" : current === "updating" ? "bg-[var(--ember-info)]" : "bg-[var(--ember-warning)]"}`} aria-hidden="true" />
      {trustIndicatorLabel(state, lang)}
    </span>
  );
}
