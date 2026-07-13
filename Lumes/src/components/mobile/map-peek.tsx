"use client";
// MapPeek — peek view shown at the bottom of the Map tab.
//
// When the bottom sheet is collapsed, this shows a useful summary
// instead of just a handle: hero count + top 3 priority incidents.
//
// Tap any incident card to open the detail panel. Tap the sheet handle
// to expand to the full Live tab.

import { Flame, AlertTriangle, ChevronUp, Clock } from "@/components/icons/phosphor-icons";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/use-language";
import { t } from "@/lib/i18n";
import { SEVERITY_LABEL, type Severity } from "@/lib/incident";
import type { DataTrustState } from "@/lib/data-trust";
import { DataTrustIndicator } from "@/components/ui/data-trust-indicator";

export interface PeekIncident {
  id: string;
  displayName: string;
  severity: Severity;
  municipality?: string;
  statusGroup?: string;
  statusText?: string;
  personnel?: number;
}

export interface MapPeekProps {
  total: number;
  activeCount?: number;
  critical: number;
  high: number;
  topIncidents: PeekIncident[];
  onTapIncident: (id: string) => void;
  onExpand: () => void;
  onViewIncidents: () => void;
  lastUpdated?: Date | null;
  dataTrust?: DataTrustState;
  optionalLayerWarning?: string;
  compact?: boolean;
}

export function mapPeekActiveLabel(lang: "pt" | "en"): string {
  return lang === "pt" ? "ativos" : "active";
}

function formatRelative(date: Date, lang: string): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return lang === "pt" ? "agora" : "now";
  if (diff < 3600) return lang === "pt" ? `há ${Math.floor(diff / 60)} min` : `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return lang === "pt" ? `há ${Math.floor(diff / 3600)}h` : `${Math.floor(diff / 3600)}h ago`;
  return lang === "pt" ? `há ${Math.floor(diff / 86400)}d` : `${Math.floor(diff / 86400)}d ago`;
}

export function MapPeek({
  total,
  activeCount = total,
  critical,
  high,
  topIncidents,
  lastUpdated,
  onTapIncident,
  onExpand,
  onViewIncidents,
  compact = false,
  dataTrust,
  optionalLayerWarning,
}: MapPeekProps) {
  const { language: lang } = useLanguage();
  const sevColor = (s: Severity) =>
    s === "critical" ? "var(--ember-critical)" :
    s === "high" ? "var(--ember-warning)" :
    s === "medium" ? "var(--ember-info)" :
    "var(--ember-success)";
  const trustWarning = dataTrust && dataTrust.state !== "fresh" && dataTrust.state !== "updating"
    ? dataTrust.state === "fallback"
      ? (lang === "pt" ? "A mostrar dados alternativos" : "Showing fallback data")
      : dataTrust.state === "stale"
        ? (lang === "pt" ? "Dados desatualizados" : "Data may be stale")
        : dataTrust.state === "empty"
          ? (lang === "pt" ? "Sem dados disponíveis" : "No data available")
          : (lang === "pt" ? "A atualização falhou" : "Refresh failed")
    : null;

  return (
    <div className="h-full flex flex-col bg-[var(--ember-bg)]">
      {compact ? (
        <button
          type="button"
          onClick={onExpand}
          className="h-full min-h-14 w-full px-4 flex items-center gap-3 text-left hover:bg-[var(--ember-surface-2)] transition-colors"
          aria-label={lang === "pt" ? "Expandir resumo de incêndios" : "Expand fire summary"}
        >
          <Flame className="w-4 h-4 text-[var(--ember-critical)] flex-shrink-0" />
          <span className="font-mono font-bold tabular-nums text-lg text-[var(--ember-text)]">{activeCount}</span>
          <span className="text-xs text-[var(--ember-text-muted)]">
            {mapPeekActiveLabel(lang)}
          </span>
          {total !== activeCount && (
            <span className="text-meta text-[var(--ember-text-faint)]">
              · {total} {lang === "pt" ? "visíveis" : "visible"}
            </span>
          )}
          {critical > 0 && (
            <span className="ml-auto text-xs font-medium text-[var(--ember-critical)] tabular-nums">
              {critical} {lang === "pt" ? "crítico" : "critical"}
            </span>
          )}
          <ChevronUp className="w-4 h-4 text-[var(--ember-text-faint)]" aria-hidden="true" />
        </button>
      ) : (
        <>
      {/* Drag handle — bigger, more visible */}
      <button
        type="button"
        onClick={onViewIncidents}
        className="flex flex-col items-center pt-2.5 pb-2 active:bg-[var(--ember-surface-2)] transition-colors"
        aria-label={lang === "pt" ? "Expandir painel" : "Expand panel"}
      >
        <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)] mb-1.5" />
        <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-semibold">
          {lang === "pt" ? "Incidentes" : "Incidents"}
        </span>
      </button>

      {/* Hero count + severity breakdown */}
      <div className="px-4 pb-2 flex items-center gap-3">
        <div className="flex items-baseline gap-1.5">
          <Flame className="w-4 h-4 text-[var(--ember-critical)]" />
          <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ember-text)]">
            {activeCount}
          </span>
          <span className="text-meta text-[var(--ember-text-faint)] uppercase tracking-wider">
            {mapPeekActiveLabel(lang)}
          </span>
          {total !== activeCount && (
            <span className="text-meta text-[var(--ember-text-faint)]">
              · {total} {lang === "pt" ? "visíveis" : "visible"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto text-meta">
          {lastUpdated && (
            <span className="flex items-center gap-1 text-[var(--ember-text-faint)] tabular-nums">
              <Clock className="w-3 h-3" />
              <span title={lastUpdated.toISOString()}>
                {formatRelative(lastUpdated, lang)}
              </span>
            </span>
          )}
          <DataTrustIndicator state={dataTrust?.state ?? "fresh"} lang={lang} reason={dataTrust?.reason} compact />
          {critical > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--ember-critical)]/15 text-[var(--ember-critical)] font-medium">
              <AlertTriangle className="w-3 h-3" />
              <span className="tabular-nums">{critical}</span>
            </span>
          )}
          {high > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--ember-warning)]/15 text-[var(--ember-warning)] font-medium">
              <span className="tabular-nums">{high}</span>
            </span>
          )}
        </div>
      </div>

      {(trustWarning || optionalLayerWarning) && (
        <div className="mx-3 mb-2 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)] px-2 py-1 text-meta text-[var(--ember-warning)]" role="status">
          {trustWarning ?? optionalLayerWarning}
          {trustWarning && optionalLayerWarning ? ` · ${optionalLayerWarning}` : ""}
        </div>
      )}

      {/* Top 3 priority incidents — scrollable horizontal cards */}
      {topIncidents.length > 0 ? (
        <div className="flex-1 px-3 pb-3 overflow-x-auto overflow-y-hidden ember-scroll">
          <div className="flex gap-2 h-full">
            {topIncidents.slice(0, 5).map((inc) => (
              <button
                key={inc.id}
                type="button"
                onClick={() => onTapIncident(inc.id)}
                className="flex-shrink-0 w-44 h-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-lg p-2 text-left flex flex-col gap-1 active:scale-[0.98] transition-transform hover:border-[var(--ember-border-strong)]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: sevColor(inc.severity) }}
                    aria-hidden
                  />
                  <span
                    className="text-meta uppercase tracking-wider font-semibold flex-1 truncate"
                    style={{ color: sevColor(inc.severity) }}
                  >
                    {SEVERITY_LABEL[inc.severity][lang]}
                  </span>
                </div>
                <p className="text-xs font-medium text-[var(--ember-text)] line-clamp-2 leading-tight">
                  {inc.displayName}
                </p>
                {inc.municipality && (
                  <p className="text-[length:var(--type-secondary)] text-[var(--ember-text-faint)] truncate">
                    {inc.municipality}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between text-meta text-[var(--ember-text-faint)]">
                  {inc.personnel !== undefined && inc.personnel > 0 && (
                    <span>👤 {inc.personnel}</span>
                  )}
                  {inc.statusGroup && (
                    <span className="truncate ml-1">{inc.statusGroup}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 pb-3 flex items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-10 h-10 rounded-full bg-[var(--ember-success)]/10 border border-[var(--ember-success)]/20 flex items-center justify-center mx-auto mb-1.5">
              <Flame className="w-4 h-4 text-[var(--ember-success)]" />
            </div>
            <p className="text-[11px] font-medium text-[var(--ember-text)]">
              {t(lang, "error.noIncidents")}
            </p>
            <p className="text-[length:var(--type-secondary)] text-[var(--ember-text-faint)] mt-0.5 max-w-[200px]">
              {t(lang, "error.noIncidentsDesc")}
            </p>
          </motion.div>
        </div>
      )}

      {/* Expand button */}
      <button
        type="button"
        onClick={onExpand}
        className="w-full flex items-center justify-center gap-1 py-1.5 border-t border-[var(--ember-border)] text-[length:var(--type-secondary)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
      >
        <span className="uppercase tracking-wider font-semibold">
          {lang === "pt" ? "Ver todos" : "See all"}
        </span>
        <ChevronUp className="w-3 h-3" />
      </button>
        </>
      )}
    </div>
  );
}
