"use client";
// FilterStatus — Single, smart filter indicator that replaces the
// previous "many dismissable pills" approach.
//
// Design philosophy:
// - ONE clear status pill shows what's currently filtered (e.g. "Só críticos")
// - Clicking the X on the pill clears that one filter
// - A "Limpar tudo" button clears all filters and returns to defaults
// - When NO filters are active, nothing is shown
// - Defaults are "show everything" so the user always sees fires

import { motion, AnimatePresence } from "framer-motion";
import { X, Funnel, ArrowCounterClockwise } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";

export interface FilterStatusItem {
  id: string;
  /** Short label for the chip */
  label: string;
  /** Tooltip / full description */
  description?: string;
  /** Clear this single filter */
  onClear: () => void;
  /** Category for color/icon (optional) */
  category?: "filter" | "layer";
}

export interface FilterStatusProps {
  lang: Language;
  /** Active filter items */
  items: FilterStatusItem[];
  /** Clear all filters at once */
  onClearAll: () => void;
  /** Number of incidents after filtering (for context) */
  filteredCount?: number;
  /** Total incidents (for context) */
  totalCount?: number;
}

export function FilterStatus({
  lang,
  items,
  onClearAll,
  filteredCount,
  totalCount,
}: FilterStatusProps) {
  const isActive = items.length > 0;
  const noResults = isActive && filteredCount === 0 && totalCount !== undefined;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-b border-[var(--ember-border)] bg-[var(--ember-surface-2)]/50 overflow-hidden"
        >
          <div className="px-4 py-3 space-y-2.5">
            {/* Header row: filter icon + label + count + clear all */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Funnel className="w-3.5 h-3.5 text-[var(--ember-accent)] flex-shrink-0" weight="bold" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-semibold">
                  {lang === "pt" ? "Filtros ativos" : "Active filters"}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-[var(--ember-accent)]">
                  ({items.length})
                </span>
                {filteredCount !== undefined && totalCount !== undefined && (
                  <span className="text-[10px] text-[var(--ember-text-faint)] ml-auto tabular-nums">
                    {filteredCount} {lang === "pt" ? "de" : "of"} {totalCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClearAll}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface)] transition-colors flex-shrink-0"
                aria-label={lang === "pt" ? "Limpar todos os filtros" : "Clear all filters"}
              >
                <ArrowCounterClockwise className="w-2.5 h-2.5" />
                {lang === "pt" ? "Limpar" : "Clear"}
              </button>
            </div>

            {/* Filter chips — single row, horizontally scrollable if many */}
            <div className="flex items-center gap-1.5 overflow-x-auto ember-scroll pb-0.5">
              {items.map((item) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={item.onClear}
                  title={item.description ?? item.label}
                  aria-label={`${item.label} — ${lang === "pt" ? "remover" : "remove"}`}
                  className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                    item.category === "layer"
                      ? "bg-[var(--ember-info)]/20 border border-[var(--ember-info)]/40 text-[var(--ember-info)] hover:bg-[var(--ember-info)]/30"
                      : "bg-[var(--ember-accent)] text-[#1a1410] hover:shadow-[0_0_0_3px_var(--ember-accent-subtle)]"
                  }`}
                >
                  <span className="leading-none">{item.label}</span>
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                      item.category === "layer"
                        ? "bg-[var(--ember-info)]/30 group-hover:bg-[var(--ember-info)]/50"
                        : "bg-black/20 group-hover:bg-black/30"
                    }`}
                  >
                    <X className="w-2 h-2" />
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Empty state — when filters exclude everything */}
            <AnimatePresence>
              {noResults && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-[10px] text-[var(--ember-warning)] flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-[var(--ember-warning)]/10 border border-[var(--ember-warning)]/20"
                >
                  <span className="font-semibold">
                    {lang === "pt" ? "Sem resultados" : "No matches"}
                  </span>
                  <span className="text-[var(--ember-text-faint)]">
                    {lang === "pt" ? "— alarga os filtros para ver mais" : "— widen filters to see more"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
