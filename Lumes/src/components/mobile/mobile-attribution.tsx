"use client";
// MobileAttribution — floating "X incidents" pill at top-left of the map.
// Mirrors the desktop attribution pill but in mobile-friendly sizing.
// Tappable to open the Live tab.

import { motion } from "framer-motion";
import { Flame, ChevronUp } from "@/components/icons/phosphor-icons";
import { useLanguage } from "@/lib/use-language";
import { tFmt, t } from "@/lib/i18n";
import type { DataTrustState } from "@/lib/data-trust";

export function MobileAttribution({
  count,
  dataTrust,
  onTap,
}: {
  count: number;
  dataTrust?: DataTrustState;
  onTap?: () => void;
}) {
  const { language: lang } = useLanguage();
  return (
    <motion.button
      type="button"
      onClick={onTap}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="absolute top-3 left-3 z-20 pointer-events-auto min-h-11"
      aria-label={tFmt(lang, "map.activeTap", { count })}
    >
      <div className="min-h-11 bg-[var(--ember-surface)]/95 backdrop-blur-md border border-[var(--ember-border)] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.3)] px-3.5 py-2 flex items-center gap-1.5 text-xs active:scale-95 transition-transform hover:border-[var(--ember-accent)]">
        <Flame
          className={`w-3.5 h-3.5 ${count > 0 ? "text-[var(--ember-critical)]" : "text-[var(--ember-text-faint)]"}`}
        />
        <span className="font-mono font-bold text-[var(--ember-text)] tabular-nums text-sm">
          {count}
        </span>
        <span className="text-[var(--ember-text-muted)]">
          {count === 1
            ? (lang === "pt" ? "incêndio" : "fire")
            : (lang === "pt" ? "incêndios" : "fires")}
        </span>
        {dataTrust && dataTrust.state !== "fresh" && (
          <span className="max-w-24 truncate text-[10px] text-[var(--ember-warning)]" title={dataTrust.reason ?? undefined}>
            {dataTrust.state === "fallback"
              ? (lang === "pt" ? "alternativos" : "fallback")
              : dataTrust.state === "stale"
                ? (lang === "pt" ? "desatualizados" : "stale")
                : dataTrust.state === "error"
                  ? (lang === "pt" ? "a atualizar" : "retrying")
                  : (lang === "pt" ? "a atualizar" : "updating")}
          </span>
        )}
        <ChevronUp className="w-3 h-3 text-[var(--ember-accent)] opacity-60" aria-hidden="true" />
      </div>
    </motion.button>
  );
}
