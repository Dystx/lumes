"use client";
// OperationalPhases — bar chart of raw ANEPC status groups (EstadoAgrupado).
//
// Each row is clickable to filter the map to only incidents in that phase.
// Active row is highlighted with accent color and shows a "Clear" button.
//
// Tasks C-leaves (refactor plan): extracted from page.tsx.

import { X } from "lucide-react";
import { PHASE_COLOR } from "@/lib/incident";

export interface OperationalPhasesProps {
  /** Map of phase name → count, from dashboard byStatusGroup */
  byStatusGroup: Record<string, number>;
  /** Current phase filter (null = no filter) */
  phaseFilter: string | null;
  /** Setter — pass null to clear */
  setPhaseFilter: (p: string | null) => void;
  /** Current language */
  lang: "pt" | "en";
}

export function OperationalPhases({
  byStatusGroup,
  phaseFilter,
  setPhaseFilter,
  lang,
}: OperationalPhasesProps) {
  if (!byStatusGroup || Object.keys(byStatusGroup).length === 0) return null;

  const entries = Object.entries(byStatusGroup).sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div className="px-4 py-3 border-b border-[var(--ember-border)]">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {lang === "pt" ? "Fases Operacionais" : "Operational Phases"}
        </div>
        {phaseFilter && (
          <button
            type="button"
            onClick={() => setPhaseFilter(null)}
            className="text-[10px] text-[var(--ember-accent)] hover:underline flex items-center gap-1"
            aria-label={lang === "pt" ? "Limpar filtro de fase" : "Clear phase filter"}
          >
            <X className="w-2.5 h-2.5" />
            {lang === "pt" ? "Limpar" : "Clear"}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {entries.map(([phase, count]) => {
          const color = PHASE_COLOR[phase] ?? "var(--ember-text-faint)";
          const pct = max > 0 ? (count / max) * 100 : 0;
          const isActive = phaseFilter === phase;
          return (
            <button
              key={phase}
              type="button"
              onClick={() => setPhaseFilter(isActive ? null : phase)}
              aria-pressed={isActive}
              className={`w-full flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-left focus:outline-none focus:ring-1 focus:ring-[var(--ember-accent)]/40 ${
                isActive
                  ? "bg-[var(--ember-accent-subtle)]"
                  : "hover:bg-[var(--ember-surface-2)]"
              }`}
            >
              <span
                className="w-1.5 h-3 rounded-sm flex-shrink-0"
                style={{ background: color }}
                aria-hidden
              />
              <span
                className={`flex-1 text-[11px] truncate ${
                  isActive
                    ? "text-[var(--ember-accent)] font-medium"
                    : "text-[var(--ember-text)]"
                }`}
              >
                {phase}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-[var(--ember-surface-2)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span
                className={`w-6 text-right text-[11px] font-mono font-semibold tabular-nums ${
                  isActive ? "text-[var(--ember-accent)]" : "text-[var(--ember-text)]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}