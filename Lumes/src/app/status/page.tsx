// Public status page — visible at /status on lumes.pt.
//
// Two audiences:
//   - Citizens: a reassuring "is the site working right now?"
//   - Operators: a one-glance summary of upstream health, ingest
//     freshness, and DB size, with quick links to the runbook.
//
// Data sources (all read-only, all JSON endpoints):
//   - /api/health   : liveness + last-update freshness
//   - /api/stats    : counts of incidents / snapshots
//   - /api/source-health : individual upstream status

import { Suspense } from "react";
import { PublicPageShell } from "@/components/public/public-page-shell";
import {
  normalizeHealthResponse,
  normalizeSourceHealthResponse,
  normalizeStatsResponse,
  type HealthResponse,
  type SourceHealthEntry,
  type SourceHealthResponse,
  type StatsResponse,
} from "@/lib/status-page-data";

export type { HealthResponse, SourceHealthEntry, SourceHealthResponse, StatsResponse } from "@/lib/status-page-data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export interface StatusPageData {
  health: HealthResponse;
  stats: StatsResponse;
  sources: SourceHealthResponse;
}

export interface StatusPageViewModel extends StatusPageData {
  overall: "ok" | "degraded";
  sourceState: "available" | "empty";
}

export const STATUS_LOADING_LABEL = "A carregar…";

export type StatusPageFetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Keeps server fetch fallbacks and status-page presentation deterministic. */
export function buildStatusViewModel(data: StatusPageData): StatusPageViewModel {
  return {
    ...data,
    overall: data.health.status === "ok" ? "ok" : "degraded",
    sourceState: data.sources.sources.length === 0 ? "empty" : "available",
  };
}

export function statusBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.LUMES_STATUS_BASE_URL || env.NEXT_PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (env.NODE_ENV === "production") return "https://lumes.pt";
  return `http://127.0.0.1:${env.PORT || "3000"}`;
}

const defaultStatusFetcher: StatusPageFetcher = (input, init) => fetch(input, init);

export async function loadStatusPageData(
  fetcher: StatusPageFetcher = defaultStatusFetcher,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StatusPageData> {
  // Server-side fetch requires an absolute URL. Production defaults to the
  // canonical public origin instead of silently calling an unrelated port.
  const base = statusBaseUrl(env);

  async function fetchJson<T>(
    url: string,
    fallback: T,
    normalize: (value: unknown, fallback: T) => T,
  ): Promise<T> {
    try {
      const res = await fetcher(`${base}${url}`, {
        cache: "no-store",
      });
      if (!res.ok) return fallback;
      return normalize(await res.json(), fallback);
    } catch {
      return fallback;
    }
  }

  const [health, stats, sources] = await Promise.all([
    fetchJson<HealthResponse>("/api/health", {
      status: "degraded",
      timestamp: new Date().toISOString(),
      uptime_s: 0,
      latencyMs: 0,
      checks: {},
      lastIncidentUpdate: null,
    }, normalizeHealthResponse),
    fetchJson<StatsResponse>(
      "/api/stats",
      { total: 0, active: 0, resolved: 0, snapshots: 0 },
      normalizeStatsResponse,
    ),
    fetchJson<SourceHealthResponse>(
      "/api/source-health",
      { sources: [] },
      (value) => normalizeSourceHealthResponse(value),
    ),
  ]);

  return { health, stats, sources };
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const ageMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (ageMin < 1) return "agora mesmo";
  if (ageMin < 60) return `há ${ageMin} min`;
  const ageH = Math.round(ageMin / 60);
  if (ageH < 24) return `há ${ageH} h`;
  return date.toLocaleDateString("pt-PT");
}

function statusBadge(status: "ok" | "degraded" | "stale" | "error" | "fail" | "disabled") {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "operacional", cls: "bg-[var(--ember-success-subtle)] text-[var(--ember-success)] border-[var(--ember-success)]/30" },
    degraded: { label: "degradado", cls: "bg-[var(--ember-warning-subtle)] text-[var(--ember-warning)] border-[var(--ember-warning)]/30" },
    stale: { label: "dados parados", cls: "bg-[var(--ember-warning-subtle)] text-[var(--ember-warning)] border-[var(--ember-warning)]/30" },
    error: { label: "erro", cls: "bg-[var(--ember-critical-subtle)] text-[var(--ember-critical)] border-[var(--ember-critical)]/30" },
    fail: { label: "erro", cls: "bg-[var(--ember-critical-subtle)] text-[var(--ember-critical)] border-[var(--ember-critical)]/30" },
    disabled: { label: "desativado", cls: "bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] border-[var(--ember-border)]" },
  };
  const s = map[status] ?? { label: status, cls: "bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] border-[var(--ember-border)]" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

async function StatusCards() {
  const view = buildStatusViewModel(await loadStatusPageData());
  return <StatusPageView view={view} />;
}

export function StatusPageView({ view }: { view: StatusPageViewModel }) {
  return (
    <div className="space-y-6">
      {/* Overall status banner */}
      <div
        role="status"
        aria-live="polite"
        data-status-state={view.overall}
        className={`rounded-lg border p-4 ${
          view.overall === "ok"
            ? "border-[var(--ember-success)]/30 bg-[var(--ember-success-subtle)]"
            : "border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[var(--ember-text-muted)]">Estado do site</div>
            <div className="text-2xl font-semibold mt-0.5">
              {view.overall === "ok" ? "Tudo operacional" : "Operação degradada"}
            </div>
          </div>
          <div className="text-xs text-[var(--ember-text-faint)] text-right">
            última atualização<br />
            <span className="text-[var(--ember-text-muted)]">{formatTime(view.health.lastIncidentUpdate)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ocorrências registadas" value={view.stats.total.toLocaleString("pt-PT")} />
        <StatCard label="Ocorrências ativas" value={view.stats.active.toLocaleString("pt-PT")} />
        <StatCard label="Resolvidas" value={view.stats.resolved.toLocaleString("pt-PT")} />
        <StatCard label="Snapshots de estado" value={view.stats.snapshots.toLocaleString("pt-PT")} />
      </div>

      {/* Source health */}
      <div>
        <h2 className="text-sm font-medium text-[var(--ember-text-muted)] uppercase tracking-wider mb-2">
          Fontes de dados
        </h2>
        <div className="rounded-lg border border-[var(--ember-border)] divide-y divide-[var(--ember-border)]" data-status-sources-state={view.sourceState}>
          {view.sourceState === "empty" ? (
            <p className="px-4 py-5 text-sm text-[var(--ember-text-muted)]">Não foi possível confirmar o estado das fontes neste momento.</p>
          ) : view.sources.sources.map((s) => (
            <div key={s.sourceId} className="p-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {statusBadge(s.status)}
                <span className="truncate text-[var(--ember-text)]">{s.sourceName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ember-text-faint)] sm:justify-end">
                <span>{s.recordCount.toLocaleString("pt-PT")} registos</span>
                <span>{s.latencyMs === null ? "—" : `${Math.round(s.latencyMs)} ms`}</span>
                <span>{formatTime(s.lastSuccess)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="border-t border-[var(--ember-border)] pt-4 text-xs text-[var(--ember-text-faint)]">
        O estado degradado significa que os dados podem estar incompletos. Confirme sempre junto das autoridades locais em caso de emergência.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--ember-border)] bg-[var(--ember-surface)]/30 p-3">
      <div className="text-xs text-[var(--ember-text-muted)]">{label}</div>
      <div className="text-2xl font-semibold mt-1 text-[var(--ember-text)]">{value}</div>
    </div>
  );
}

export default function StatusPage() {
  return (
    <PublicPageShell
      title="Estado do serviço"
      description="Veja se o lumes.pt está operacional e se as fontes de dados estão atualizadas."
    >
      <div className="max-w-3xl">
        <Suspense fallback={<div role="status" aria-live="polite" data-status-state="loading" className="text-[var(--ember-text-faint)]">{STATUS_LOADING_LABEL}</div>}>
          <StatusCards />
        </Suspense>
      </div>
    </PublicPageShell>
  );
}
