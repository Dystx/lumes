"use client";
// MobileLegend — collapsible map legend for mobile.
//
// Top-left of the map. Tap to expand showing severity colors with live counts.
// Severity rows are tappable to apply that severity as a quick filter.
//
// State:
// - Collapsed: just shows "LEGEND" button
// - Expanded: shows severity legend with counts, plus source types

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import { SEVERITY_LABEL, type Severity } from "@/lib/incident";

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--ember-critical)",
  high: "var(--ember-warning)",
  medium: "var(--ember-info)",
  low: "var(--ember-success)",
};

export interface MobileLegendProps {
  lang: Language;
  counts?: Partial<Record<Severity, number>>;
  onToggleSeverity?: (severity: Severity) => void;
  activeSeverities?: Set<Severity>;
  topOffset?: number;
}

export function MobileLegend({
  lang,
  counts,
  onToggleSeverity,
  activeSeverities,
  topOffset = 64,
}: MobileLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const severities: Severity[] = ["critical", "high", "medium", "low"];
  const total = counts
    ? Object.values(counts).reduce((s, v) => s + (v ?? 0), 0)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      className="absolute left-3 z-20 pointer-events-auto"
      style={{ top: topOffset }}
    >
      <div className="bg-[var(--ember-surface)]/95 backdrop-blur-md border border-[var(--ember-border)] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.3)] overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded
            ? (lang === "pt" ? "Recolher legenda" : "Collapse legend")
            : (lang === "pt" ? "Expandir legenda" : "Expand legend")}
          data-testid="mobile-legend-toggle"
          className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors w-full"
        >
          <span>{t(lang, "sidebar.legend")}</span>
          {total > 0 && (
            <span className="text-meta text-[var(--ember-text-faint)] tabular-nums font-mono">
              {total}
            </span>
          )}
          <ChevronDown
            className={`w-3 h-3 text-[var(--ember-text-muted)] transition-transform ml-auto ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-2 pb-2 pt-1 min-w-[180px]">
                {/* Severity rows — tappable when onToggleSeverity is set */}
                <div className="space-y-0.5">
                  {severities.map((s) => {
                    const color = SEVERITY_COLOR[s];
                    const count = counts?.[s] ?? 0;
                    const isActive = activeSeverities?.has(s);
                    const interactive = !!onToggleSeverity;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => interactive && onToggleSeverity?.(s)}
                        disabled={!interactive}
                        className={`w-full flex items-center gap-2 px-1.5 py-1 rounded text-left transition-colors ${
                          interactive
                            ? "hover:bg-[var(--ember-surface-2)] active:bg-[var(--ember-surface-2)] cursor-pointer"
                            : "cursor-default"
                        } ${isActive ? "bg-[var(--ember-accent-subtle)]" : ""}`}
                        aria-pressed={isActive}
                      >
                        <span
                          className={`flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center text-[7px] font-bold text-white ${s === "critical" ? "rounded-sm" : "rounded-full"}`}
                          style={{ background: color }}
                          aria-hidden
                        >{s === "critical" ? "!" : ""}</span>
                        <span className="text-meta text-[var(--ember-text)] flex-1">
                          {SEVERITY_LABEL[s][lang]}
                        </span>
                        {count > 0 && (
                          <span
                            className="text-meta font-mono tabular-nums font-semibold"
                            style={{ color }}
                          >
                            {count}
                          </span>
                        )}
                        {interactive && isActive && (
                          <X className="w-3 h-3 text-[var(--ember-accent)]" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
