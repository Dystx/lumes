"use client";
// EmptyState + LoadingSkeleton — feedback components for mobile UX.
//
// Used when:
//   - Map has no incidents to show
//   - News section has no matches
//   - Dashboard is still loading initial data
//   - Filters return no results

import { Flame, Search, MapPin } from "@/components/icons/phosphor-icons";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

export interface EmptyStateProps {
  variant?: "no-incidents" | "no-results" | "no-news" | "no-fires-near" | "no-data" | "error";
  lang: Language;
  onReset?: () => void;
  compact?: boolean;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ variant = "no-results", lang, onReset, compact, action }: EmptyStateProps) {
  const config = {
    "no-incidents": {
      icon: Flame,
      title: t(lang, "error.noIncidents"),
      description: t(lang, "error.noIncidentsDesc"),
    },
    "no-results": {
      icon: Search,
      title: lang === "pt" ? "Sem resultados" : "No results",
      description: lang === "pt"
        ? "Tente outro termo de pesquisa ou ajuste os filtros."
        : "Try another search term or adjust your filters.",
    },
    "no-news": {
      icon: Search,
      title: lang === "pt" ? "Sem notícias" : "No news",
      description: lang === "pt"
        ? "Nenhuma notícia corresponde aos concelhos com incêndios ativos."
        : "No news currently matches municipalities with active fires.",
    },
    "no-fires-near": {
      icon: MapPin,
      title: lang === "pt" ? "Sem incêndios próximos" : "No nearby fires",
      description: lang === "pt"
        ? "Não foram detetados incêndios na sua localização atual."
        : "No fires detected near your current location.",
    },
  }[variant];

  const Icon = config.icon;
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <div className="w-12 h-12 rounded-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] flex items-center justify-center mb-1">
        <Icon className="w-5 h-5 text-[var(--ember-text-faint)]" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--ember-text)]">{config.title}</h3>
      <p className="text-xs text-[var(--ember-text-muted)] leading-relaxed max-w-xs">
        {config.description}
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 px-3 py-1.5 rounded-md bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] text-xs font-medium hover:bg-[var(--ember-accent)]/15 transition-colors"
        >
          {t(lang, "common.clear")}
        </button>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 px-3 py-1.5 rounded-md bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] text-xs font-medium hover:bg-[var(--ember-accent)]/15 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export interface LoadingSkeletonProps {
  rows?: number;
  height?: number;
}

export function LoadingSkeleton({ rows = 3, height = 48 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] animate-pulse"
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
}