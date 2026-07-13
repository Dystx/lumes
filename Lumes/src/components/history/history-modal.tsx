"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Search, X } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import { filterHistoryIncidents } from "@/lib/history-view";
import { useHistoryNew } from "@/lib/use-app-data";
import type { HistoryIncident, HistoryResponse } from "@/lib/types";
import type { UseFetchResult } from "@/lib/use-fetch";
import { EmptyState } from "@/components/ui/empty-state";
import { OverlayDialog } from "@/components/ui/overlay-dialog";
import { Skeleton, StaggerChildren, StaggerItem } from "@/components/ember-anim";
import { SectionError } from "@/components/ui/section-error";
import { DataTrustIndicator } from "@/components/ui/data-trust-indicator";

interface HistoryModalProps {
  onClose: () => void;
  onSelectIncident: (incident: HistoryIncident) => void;
  lang: Language;
  sharedHistory?: UseFetchResult<HistoryResponse | null>;
}

export function HistoryModal({ onClose, onSelectIncident, lang, sharedHistory }: HistoryModalProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const localHistory = useHistoryNew(
    statusFilter === "all" ? undefined : statusFilter,
    !sharedHistory || statusFilter !== "all",
  );
  const history = statusFilter === "all" && sharedHistory ? sharedHistory : localHistory;
  const incidents = history.data?.incidents ?? [];
  const loading = history.loading;
  const error = history.error;
  const resolvedTotal = history.data?.total ?? 0;

  const filtered = useMemo(
    () => filterHistoryIncidents(incidents, searchTerm),
    [incidents, searchTerm],
  );

  return (
    <OverlayDialog
      ariaLabel={t(lang, "history.title")}
      onClose={onClose}
      panelClassName="w-full max-w-[600px] max-h-[80vh] rounded-xl border border-[var(--ember-border)]"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ember-border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[var(--ember-accent-subtle)] flex items-center justify-center">
            <Clock className="w-4 h-4 text-[var(--ember-accent)]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ember-text)]">{t(lang, "history.title")}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-meta text-[var(--ember-text-faint)]">
                {resolvedTotal} {t(lang, "history.subtitle")}
              </p>
              <DataTrustIndicator state={history.trust.state} lang={lang} reason={history.trust.reason} compact />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
          aria-label={t(lang, "a11y.closeHistory")}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
        <div className="flex gap-1.5">
          {["all", "active", "contained", "resolved"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                statusFilter === status
                  ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] border border-[var(--ember-accent)]/30"
                  : "bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] border border-transparent"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ember-text-faint)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t(lang, "history.search")}
            className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none h-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto ember-scroll p-3">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 p-3">
                <Skeleton width={10} height={10} className="rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton width="50%" height={10} />
                  <Skeleton width="30%" height={8} />
                </div>
                <Skeleton width={40} height={8} />
              </div>
            ))}
          </div>
        )}

        {!loading && error && <SectionError compact onRetry={history.refetch} />}

        {!loading && !error && filtered.length === 0 && (
          resolvedTotal === 0 && statusFilter === "all" && searchTerm.trim() === "" ? (
            <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
              <div className="w-12 h-12 rounded-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] flex items-center justify-center mb-1">
                <Clock className="w-5 h-5 text-[var(--ember-text-faint)]" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ember-text)]">{t(lang, "history.emptyTitle")}</h3>
              <p className="text-xs text-[var(--ember-text-muted)] leading-relaxed max-w-xs">{t(lang, "history.emptyDescription")}</p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <EmptyState
                variant="no-results"
                lang={lang}
                compact
                action={{
                  label: lang === "pt" ? "Limpar filtros" : "Clear filters",
                  onClick: () => {
                    setStatusFilter("all");
                    setSearchTerm("");
                  },
                }}
              />
            </div>
          )
        )}

        {!loading && filtered.length > 0 && (
          <StaggerChildren stagger={0.02} className="space-y-1">
            {filtered.map((incident) => {
              const severityColor = incident.severity === "critical"
                ? "var(--ember-critical)"
                : incident.severity === "high"
                  ? "var(--ember-warning)"
                  : incident.severity === "medium"
                    ? "var(--ember-info)"
                    : "var(--ember-success)";
              return (
                <StaggerItem key={incident.id}>
                  <motion.button
                    type="button"
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelectIncident(incident)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-md border border-transparent hover:bg-[var(--ember-surface-2)] hover:border-[var(--ember-border)] transition-all text-left"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: severityColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--ember-text)] truncate">
                        {incident.displayName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-meta text-[var(--ember-text-faint)]">
                        <span style={{ color: severityColor }} className="uppercase tracking-wider font-semibold">
                          {incident.severity}
                        </span>
                        <span>·</span>
                        <span className="truncate">{incident.municipality || "—"}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-meta text-[var(--ember-text-muted)] uppercase tracking-wider font-medium">
                        {incident.status}
                      </div>
                      <div className="text-meta text-[var(--ember-text-faint)] font-mono mt-0.5">
                        {new Date(incident.firstDetected).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                  </motion.button>
                </StaggerItem>
              );
            })}
          </StaggerChildren>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[var(--ember-border)] flex items-center justify-between flex-shrink-0">
        <span className="text-meta text-[var(--ember-text-faint)]">
          {lang === "pt" ? `A mostrar ${filtered.length} de ${resolvedTotal} incêndios` : `Showing ${filtered.length} of ${resolvedTotal} incidents`}
        </span>
        <span className="text-meta text-[var(--ember-text-faint)]">
          {lang === "pt" ? "Toque num incêndio para ver detalhes" : "Click an incident to view details"}
        </span>
      </div>
    </OverlayDialog>
  );
}
