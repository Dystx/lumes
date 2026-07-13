"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Clock, Flame, Radio } from "@/components/icons/phosphor-icons";
import { DataTrustIndicator } from "@/components/ui/data-trust-indicator";
import { t, type Language } from "@/lib/i18n";
import type { Severity } from "@/lib/types";

type TrustState = "healthy" | "stale" | "fallback" | "empty" | "retryable-error";

export interface SituationPanelProps {
  lang: Language;
  incidentCount: number;
  activeCount?: number;
  containedCount?: number;
  resolvedCount?: number;
  criticalCount: number;
  priorityIncidents: SituationPriorityIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  onOpenAllIncidents: () => void;
  trustState?: TrustState;
  trustReason?: string;
  updatedAt?: Date | string | null;
}

export interface SituationPriorityIncident {
  id: string;
  displayName: string;
  severity: Severity;
  municipality?: string | null;
  district?: string | null;
  geometry?: { coordinates: [number, number] };
}

function relativeTime(value: Date | string | null | undefined, lang: Language): string {
  if (!value) return lang === "pt" ? "a atualizar" : "updating";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return lang === "pt" ? "agora" : "just now";
  if (minutes < 60) return lang === "pt" ? `há ${minutes} min` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return lang === "pt" ? `há ${hours} h` : `${hours}h ago`;
}

export function SituationPanel({
  lang,
  incidentCount,
  activeCount = incidentCount,
  containedCount = 0,
  resolvedCount = 0,
  criticalCount,
  priorityIncidents,
  selectedIncidentId,
  onSelectIncident,
  onOpenAllIncidents,
  trustState = "healthy",
  trustReason,
  updatedAt,
}: SituationPanelProps) {
  return (
    <aside className="flex h-full w-full flex-col bg-[var(--ember-bg)]" aria-label={lang === "pt" ? "Situação atual" : "Current situation"}>
      <header className="flex-shrink-0 border-b border-[var(--ember-border)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-meta font-medium uppercase tracking-[0.16em] text-[var(--ember-text-faint)]">
              {lang === "pt" ? "Situação" : "Situation"}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--ember-text)]">
              {lang === "pt" ? "Agora em Portugal" : "Portugal right now"}
            </h2>
          </div>
          <DataTrustIndicator state={trustState} lang={lang} reason={trustReason} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-meta text-[var(--ember-text-faint)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>{lang === "pt" ? "Atualizado" : "Updated"} {relativeTime(updatedAt, lang)}</span>
        </div>
        {trustReason && trustState !== "healthy" && (
          <p className="mt-2 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning)]/10 px-2 py-1.5 text-[length:var(--type-secondary)] leading-relaxed text-[var(--ember-warning)]">
            {trustReason}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto ember-scroll">
        <section className="border-b border-[var(--ember-border)] px-4 py-5" aria-labelledby="situation-headline">
          <p id="situation-headline" className="text-meta font-medium uppercase tracking-[0.16em] text-[var(--ember-text-faint)]">
            {lang === "pt" ? "Incidentes visíveis" : "Visible incidents"}
          </p>
          <div className="mt-2 flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-[var(--ember-accent)]" aria-hidden="true" />
              <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-[var(--ember-text)]">{incidentCount}</span>
            </div>
            <span className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--ember-critical)]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {criticalCount} {lang === "pt" ? "críticos" : "critical"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-[var(--ember-text-muted)]">
            <span>{activeCount} {lang === "pt" ? "ativos" : "active"}</span>
            <span>{containedCount} {lang === "pt" ? "contidos" : "contained"}</span>
            <span>{resolvedCount} {lang === "pt" ? "resolvidos" : "resolved"}</span>
          </div>
        </section>

        <section className="px-4 py-4" aria-labelledby="situation-priority">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="situation-priority" className="text-meta font-medium uppercase tracking-[0.16em] text-[var(--ember-text-faint)]">
              {lang === "pt" ? "Prioridade" : "Priority"}
            </h3>
            <Radio className="h-3 w-3 text-[var(--ember-text-faint)]" aria-hidden="true" />
          </div>
          {priorityIncidents.length === 0 ? (
            <p data-testid="situation-empty" className="rounded-md border border-[var(--ember-border)] px-3 py-4 text-center text-[11px] text-[var(--ember-text-faint)]">
              {t(lang, "error.noPriorityDesc")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {priorityIncidents.slice(0, 5).map((incident) => {
                const selected = incident.id === selectedIncidentId;
                const color = incident.severity === "critical" ? "var(--ember-critical)" : incident.severity === "high" ? "var(--ember-warning)" : "var(--ember-info)";
                return (
                  <motion.button
                    key={incident.id}
                    type="button"
                    data-testid="situation-incident"
                    data-incident-id={incident.id}
                    data-incident-lon={incident.geometry?.coordinates[0]}
                    data-incident-lat={incident.geometry?.coordinates[1]}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onSelectIncident(incident.id)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember-accent)]/60 ${selected ? "border-[var(--ember-accent)] bg-[var(--ember-accent-subtle)]" : "border-[var(--ember-border)] hover:border-[var(--ember-accent)] hover:bg-[var(--ember-surface-2)]"}`}
                  >
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[var(--ember-text)]">{incident.displayName}</span>
                      <span className="mt-0.5 block truncate text-meta text-[var(--ember-text-faint)]">{incident.municipality || incident.district || "—"}</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ember-text-faint)]" aria-hidden="true" />
                  </motion.button>
                );
              })}
            </div>
          )}
          <button type="button" onClick={onOpenAllIncidents} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-md border border-[var(--ember-border)] px-3 text-xs font-medium text-[var(--ember-text-muted)] transition-colors hover:border-[var(--ember-accent)] hover:text-[var(--ember-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember-accent)]/60">
            <span>{lang === "pt" ? "Ver todos os incidentes" : "View all incidents"}</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </section>
      </div>
    </aside>
  );
}
