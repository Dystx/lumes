"use client";
// EmptyState — used in DashboardPanel priority list, FiltersPanel results,
// incident search, etc.
//
// Visual states:
// - "no data yet" (initial load failure)
// - "no results match filters" (filtered out)
// - "all clear" (no active incidents — celebratory)

import { motion } from "framer-motion";
import { Flame, Filter, SearchX, MapPin } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";

export type EmptyStateVariant =
  | "no-incidents"        // No fires at all (peaceful state)
  | "no-results"          // Filters excluded everything
  | "no-fires-near"       // Geolocation search yielded nothing
  | "loading"             // Loading state (skeleton-style)
  | "error";              // Error fetching data

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  lang: Language;
  /** Optional override title */
  title?: string;
  /** Optional override description */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Compact mode (smaller, used in tight spaces) */
  compact?: boolean;
}

const VARIANT_CONFIG: Record<EmptyStateVariant, {
  icon: typeof Flame;
  iconColor: string;
  iconBg: string;
}> = {
  "no-incidents": {
    icon: Flame,
    iconColor: "var(--ember-success)",
    iconBg: "var(--ember-success)/10",
  },
  "no-results": {
    icon: Filter,
    iconColor: "var(--ember-text-faint)",
    iconBg: "var(--ember-surface-2)",
  },
  "no-fires-near": {
    icon: SearchX,
    iconColor: "var(--ember-text-faint)",
    iconBg: "var(--ember-surface-2)",
  },
  "loading": {
    icon: MapPin,
    iconColor: "var(--ember-accent)",
    iconBg: "var(--ember-accent)/10",
  },
  "error": {
    icon: MapPin,
    iconColor: "var(--ember-warning)",
    iconBg: "var(--ember-warning)/10",
  },
};

export function EmptyState({
  variant = "no-results",
  lang,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  const defaultTitles: Record<EmptyStateVariant, string> = {
    "no-incidents": t(lang, "error.noIncidents"),
    "no-results": lang === "pt" ? "Sem resultados" : "No results",
    "no-fires-near": lang === "pt" ? "Nada nas proximidades" : "Nothing nearby",
    "loading": t(lang, "common.loading"),
    "error": lang === "pt" ? "Erro a carregar" : "Failed to load",
  };

  const defaultDescriptions: Record<EmptyStateVariant, string> = {
    "no-incidents": t(lang, "error.noIncidentsDesc"),
    "no-results": lang === "pt"
      ? "Tente ajustar os filtros para ver mais resultados."
      : "Try adjusting the filters to see more results.",
    "no-fires-near": lang === "pt"
      ? "Sem incêndios próximos da sua localização."
      : "No fires near your location.",
    "loading": lang === "pt" ? "A procurar incêndios…" : "Searching for fires…",
    "error": lang === "pt"
      ? "Não foi possível carregar os dados. Tente novamente."
      : "Could not load data. Please try again.",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "gap-2 py-4 px-3" : "gap-3 py-8 px-4"
      }`}
    >
      <div
        className={`rounded-full flex items-center justify-center ${
          compact ? "w-10 h-10" : "w-14 h-14"
        }`}
        style={{ background: config.iconBg, color: config.iconColor }}
      >
        <Icon className={compact ? "w-5 h-5" : "w-6 h-6"} aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-xs">
        <h3 className={`font-semibold text-[var(--ember-text)] ${compact ? "text-xs" : "text-sm"}`}>
          {title ?? defaultTitles[variant]}
        </h3>
        <p className={`text-[var(--ember-text-faint)] leading-relaxed ${compact ? "text-[10px]" : "text-xs"}`}>
          {description ?? defaultDescriptions[variant]}
        </p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-3 py-1.5 rounded-md bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] text-[10px] font-medium uppercase tracking-wider hover:bg-[var(--ember-accent)] hover:text-white transition-colors"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

/** Loading skeleton for lists (e.g. priority list while loading) */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 p-2.5 rounded-md border border-[var(--ember-border)]">
          <div className="w-2 h-2 rounded-full bg-[var(--ember-surface-2)] ember-skeleton" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 bg-[var(--ember-surface-2)] rounded ember-skeleton w-3/4" />
            <div className="h-1.5 bg-[var(--ember-surface-2)] rounded ember-skeleton w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}