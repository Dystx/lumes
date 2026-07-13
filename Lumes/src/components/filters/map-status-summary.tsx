"use client";

import { buildMapStatusSummary, type SeverityCounts } from "@/lib/map-status-summary";
import { t, type Language } from "@/lib/i18n";
import type { Severity } from "@/lib/types";

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--ember-critical)",
  high: "var(--ember-warning)",
  medium: "var(--ember-info)",
  low: "var(--ember-success)",
};

export interface MapStatusSummaryProps {
  lang: Language;
  visibleCount: number;
  severityCounts: Partial<SeverityCounts>;
  activeFilterCount?: number;
}

export function MapStatusSummary({
  lang,
  visibleCount,
  severityCounts,
  activeFilterCount = 0,
}: MapStatusSummaryProps) {
  const summary = buildMapStatusSummary({
    lang,
    visibleCount,
    severityCounts,
    activeFilterCount,
  });

  return (
    <section
      className="border-b border-[var(--ember-border)] bg-[var(--ember-surface-2)]/40 px-4 py-3"
      data-testid="map-status-summary"
      aria-label={summary.ariaLabel}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-semibold">
            {t(lang, "map.whatMapShows")}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--ember-text)] tabular-nums">
            {summary.headline}
          </p>
        </div>
        {summary.activeFilterLabel && (
          <span className="flex-shrink-0 rounded-full border border-[var(--ember-accent)]/30 bg-[var(--ember-accent-subtle)] px-2 py-1 text-meta font-semibold text-[var(--ember-accent)]">
            {summary.activeFilterLabel}
          </span>
        )}
      </div>

      {summary.breakdown ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="map-status-breakdown">
          {summary.segments.map((segment) => (
            <span key={segment.severity} className="inline-flex items-center gap-1.5 text-meta text-[var(--ember-text-muted)]">
              <span
                className={`h-2 w-2 flex-shrink-0 ${segment.severity === "critical" ? "rounded-sm" : "rounded-full"}`}
                style={{ background: SEVERITY_COLOR[segment.severity] }}
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums text-[var(--ember-text)]">{segment.count}</span>
              <span>{segment.label}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-meta text-[var(--ember-warning)]" data-testid="map-status-empty">
          {summary.emptyMessage}
        </p>
      )}
    </section>
  );
}
