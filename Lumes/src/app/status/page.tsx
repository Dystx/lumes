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

export const dynamic = "force-dynamic";
export const revalidate = 30;

type HealthResponse = {
  status: "ok" | "degraded";
  timestamp: string;
  uptime_s: number;
  latencyMs: number;
  checks: Record<string, "ok" | "fail" | "skip">;
  lastIncidentUpdate: string | null;
};

type StatsResponse = {
  total: number;
  active: number;
  resolved: number;
  snapshots: number;
};

type SourceHealthEntry = {
  sourceId: string;
  sourceName: string;
  status: "ok" | "stale" | "error";
  lastSuccess: string | null;
  lastError: string | null;
  recordCount: number;
  latencyMs: number;
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  // We render the page inside Next.js; the absolute URL is constructed
  // from environment. For local dev this falls back to relative.
  const base = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || "3000"}`;
  try {
    const res = await fetch(`${base}${url}`, {
      cache: "no-store",
      next: { revalidate: 30 },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const ageMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (ageMin < 1) return "agora mesmo";
  if (ageMin < 60) return `há ${ageMin} min`;
  const ageH = Math.round(ageMin / 60);
  if (ageH < 24) return `há ${ageH} h`;
  return date.toLocaleDateString("pt-PT");
}

function statusBadge(status: "ok" | "degraded" | "stale" | "error" | "fail") {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "operacional", cls: "bg-[var(--ember-success-subtle)] text-[var(--ember-success)] border-[var(--ember-success)]/30" },
    degraded: { label: "degradado", cls: "bg-[var(--ember-warning-subtle)] text-[var(--ember-warning)] border-[var(--ember-warning)]/30" },
    stale: { label: "dados parados", cls: "bg-[var(--ember-warning-subtle)] text-[var(--ember-warning)] border-[var(--ember-warning)]/30" },
    error: { label: "erro", cls: "bg-[var(--ember-critical-subtle)] text-[var(--ember-critical)] border-[var(--ember-critical)]/30" },
    fail: { label: "erro", cls: "bg-[var(--ember-critical-subtle)] text-[var(--ember-critical)] border-[var(--ember-critical)]/30" },
  };
  const s = map[status] ?? { label: status, cls: "bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] border-[var(--ember-border)]" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

async function StatusCards() {
  const [health, stats, sources] = await Promise.all([
    fetchJson<HealthResponse>("/api/health", {
      status: "degraded",
      timestamp: new Date().toISOString(),
      uptime_s: 0,
      latencyMs: 0,
      checks: {},
      lastIncidentUpdate: null,
    }),
    fetchJson<StatsResponse>("/api/stats", { total: 0, active: 0, resolved: 0, snapshots: 0 }),
    fetchJson<{ sources: SourceHealthEntry[] }>("/api/source-health", { sources: [] }),
  ]);

  const overall = health.status === "ok" ? "ok" : "degraded";

  return (
    <div className="space-y-6">
      {/* Overall status banner */}
      <div
        className={`rounded-lg border p-4 ${
          overall === "ok"
            ? "border-[var(--ember-success)]/30 bg-[var(--ember-success-subtle)]"
            : "border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[var(--ember-text-muted)]">Estado do site</div>
            <div className="text-2xl font-semibold mt-0.5">
              {overall === "ok" ? "Tudo operacional" : "Operação degradada"}
            </div>
          </div>
          <div className="text-xs text-[var(--ember-text-faint)] text-right">
            última atualização<br />
            <span className="text-[var(--ember-text-muted)]">{formatTime(health.lastIncidentUpdate)}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Ocorrências registadas" value={stats.total.toLocaleString("pt-PT")} />
        <StatCard label="Ocorrências ativas" value={stats.active.toLocaleString("pt-PT")} />
        <StatCard label="Resolvidas" value={stats.resolved.toLocaleString("pt-PT")} />
        <StatCard label="Snapshots de estado" value={stats.snapshots.toLocaleString("pt-PT")} />
      </div>

      {/* Source health */}
      <div>
        <h2 className="text-sm font-medium text-[var(--ember-text-muted)] uppercase tracking-wider mb-2">
          Fontes de dados
        </h2>
        <div className="rounded-lg border border-[var(--ember-border)] divide-y divide-[var(--ember-border)]">
          {sources.sources.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--ember-text-muted)]">Não foi possível confirmar o estado das fontes neste momento.</p>
          ) : sources.sources.map((s) => (
            <div key={s.sourceId} className="p-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                {statusBadge(s.status)}
                <span className="text-[var(--ember-text)]">{s.sourceName}</span>
              </div>
              <div className="text-xs text-[var(--ember-text-faint)] flex items-center gap-4">
                <span>{s.recordCount.toLocaleString("pt-PT")} registos</span>
                <span>{Math.round(s.latencyMs)} ms</span>
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
        <Suspense fallback={<div className="text-[var(--ember-text-faint)]">A carregar…</div>}>
          <StatusCards />
        </Suspense>
      </div>
    </PublicPageShell>
  );
}
