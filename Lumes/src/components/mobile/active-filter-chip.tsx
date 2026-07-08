"use client";
// ActiveFilterChips — pill bar showing active filters on the Live tab.
//
// When user clicks a counter (Critical, Active) or operational phase
// (Em Conclusão, etc.), a chip appears here with tap-to-clear action.

import { X } from "@/components/icons/phosphor-icons";
import { motion, AnimatePresence } from "framer-motion";
import { t, type Language } from "@/lib/i18n";

export interface ActiveFilter {
  id: string;
  label: string;
  onClear: () => void;
}

export function ActiveFilterChips({
  filters,
  lang,
}: {
  filters: ActiveFilter[];
  lang: Language;
}) {
  if (filters.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="sticky top-[3.5rem] z-20 px-3 py-2 bg-[var(--ember-bg)] border-b border-[var(--ember-border)] flex items-center gap-2 overflow-x-auto ember-scroll"
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex-shrink-0">
        {t(lang, "dashboard.activeFilter")}:
      </span>
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={f.onClear}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--ember-accent)] text-[var(--ember-bg)] text-[12px] font-bold uppercase tracking-wider shadow-[0_0_12px_rgba(249,115,22,0.4)] hover:scale-105 hover:shadow-[0_0_16px_rgba(249,115,22,0.6)] active:scale-95 transition-all flex-shrink-0 animate-pulse-subtle"
          aria-label={`${f.label} — ${lang === "pt" ? "remover filtro" : "remove filter"}`}
        >
          <span>{f.label}</span>
          <X className="w-3.5 h-3.5" />
        </button>
      ))}
    </motion.div>
  );
}