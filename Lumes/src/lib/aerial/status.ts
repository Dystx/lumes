import type { Language } from "@/lib/i18n";

export type AerialLayerStatusState = "loading" | "healthy" | "partial" | "empty" | "error";

export interface AerialLayerStatus {
  state: AerialLayerStatusState;
  count: number;
  helicopterCount: number;
  sourcesLive: number;
  sourcesTotal: number;
  reason: string | null;
}

export interface AerialLayerStatusInput {
  httpOk: boolean;
  count: number;
  helicopterCount?: number;
  sourcesLive: number;
  sourcesTotal?: number;
  reason?: string | null;
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

export function deriveAerialLayerStatus(input: AerialLayerStatusInput): AerialLayerStatus {
  const sourcesTotal = Math.max(1, safeCount(input.sourcesTotal ?? 3));
  const sourcesLive = Math.min(sourcesTotal, safeCount(input.sourcesLive));
  const count = safeCount(input.count);
  const helicopterCount = Math.min(count, safeCount(input.helicopterCount));
  const reason = input.reason ?? null;

  if (!input.httpOk) {
    return { state: "error", count, helicopterCount, sourcesLive, sourcesTotal, reason: reason ?? "Aerial source unavailable" };
  }
  if (sourcesLive < sourcesTotal || reason) {
    return { state: "partial", count, helicopterCount, sourcesLive, sourcesTotal, reason };
  }
  return { state: count === 0 ? "empty" : "healthy", count, helicopterCount, sourcesLive, sourcesTotal, reason: null };
}

export function createAerialLoadingStatus(): AerialLayerStatus {
  return {
    state: "loading",
    count: 0,
    helicopterCount: 0,
    sourcesLive: 0,
    sourcesTotal: 3,
    reason: null,
  };
}

export function aerialLayerStatusLabel(status: AerialLayerStatus, lang: Language): string {
  if (status.state === "loading") return lang === "pt" ? "A carregar…" : "Loading…";
  if (status.state === "error") return lang === "pt" ? "Indisponível" : "Unavailable";
  if (status.state === "empty") return lang === "pt" ? "Sem aeronaves" : "No aircraft";

  const countLabel = lang === "pt"
    ? `${status.count} ${status.count === 1 ? "aeronave" : "aeronaves"}`
    : `${status.count} ${status.count === 1 ? "aircraft" : "aircraft"}`;
  if (status.state === "partial") {
    return `${countLabel} · ${status.sourcesLive}/${status.sourcesTotal} ${lang === "pt" ? "fontes" : "sources"}`;
  }
  return countLabel;
}
