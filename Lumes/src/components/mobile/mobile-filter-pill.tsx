"use client";
// MobileFilterPill — floating pill at top-right of the map showing active
// filter count. Tap to open the FILTROS tab.
//
// Provides a clear visual indicator that filters are active even when the
// user is on the Map tab and doesn't see the FILTROS tab badge (which is
// hidden on the Map view in some configurations).

import { motion, AnimatePresence } from "framer-motion";
import { Filter } from "@/components/icons/phosphor-icons";
import { useLanguage } from "@/lib/use-language";

export function MobileFilterPill({
  count,
  onTap,
}: {
  count: number;
  onTap?: () => void;
}) {
  const { language: lang } = useLanguage();
  const hasFilters = count > 0;

  return (
    <AnimatePresence>
      {hasFilters && (
        <motion.button
          type="button"
          onClick={onTap}
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="absolute top-3 right-3 z-20 pointer-events-auto min-h-11"
          aria-label={
            lang === "pt"
              ? `${count} filtros ativos. Toque para ver.`
              : `${count} active filters. Tap to view.`
          }
        >
          <div className="relative min-h-11 bg-[var(--ember-accent)] text-white shadow-[0_2px_8px_rgba(184,66,26,0.4)] rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-transform">
            <Filter className="w-3.5 h-3.5" />
            <span className="tabular-nums">{count}</span>
            <span className="hidden sm:inline">
              {lang === "pt" ? (count === 1 ? "filtro" : "filtros") : (count === 1 ? "filter" : "filters")}
            </span>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
