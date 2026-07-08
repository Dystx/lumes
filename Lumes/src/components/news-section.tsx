"use client";
// NewsSection — sidebar panel showing fire-related press + matched-by-incident news.
//
// Uses the /api/news endpoint via the useNews() hook which:
//   1. Pulls RSS from verified Portuguese outlets (Público, Observador, DN, ECO)
//   2. Filters for fire-related keywords (PT + EN)
//   3. Cross-references headlines with active ANEPC incident municipalities
//      so an operator can see "the place that's burning" + "what the press is saying"
//
// Cache: 5 minutes server-side; 60s edge.

import { useState } from "react";
import { ExternalLink, Flame, Newspaper, Radio, Sparkles, X } from "@/components/icons/phosphor-icons";
import { useNews } from "@/lib/use-live-data";
import { t, type Language } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/empty-state";

const SEVERITY_DOT: Record<string, string> = {
  critical: "var(--ember-critical)",
  high: "var(--ember-warning)",
};

const CATEGORY_ICON: Record<string, typeof Newspaper> = {
  incident: Flame,
  press: Newspaper,
  official: Radio,
  weather: Sparkles,
};

function relTime(iso: string, lang: Language): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return lang === "pt" ? "agora" : "now";
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return lang === "pt" ? `há ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "pt" ? `há ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === "pt" ? `há ${d} d` : `${d}d ago`;
}

export default function NewsSection({ lang }: { lang: Language }) {
  const news = useNews();
  const data = news.data;
  const [tab, setTab] = useState<"matched" | "press" | "sources">("matched");

  const matched = data?.matched ?? [];
  const press = data?.press ?? [];
  const sources = data?.sources ?? [];
  const incidents = data?.incidents ?? [];

  // Default tab logic: if no matches but press available, switch to press
  const activeTab =
    tab === "matched" && matched.length === 0 && press.length > 0 ? "press" : tab;

  const items =
    activeTab === "matched"
      ? [...matched, ...incidents.slice(0, Math.max(0, 4 - matched.length))]
      : activeTab === "press"
      ? press
      : sources;

  return (
    <div className="px-4 py-3 border-b border-[var(--ember-border)]">
      {/* Header — centered title with item count */}
      <div className="text-center mb-2.5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex items-center justify-center gap-1.5">
          <Newspaper className="w-3 h-3" />
          <span>{lang === "pt" ? "Notícias" : "News"}</span>
          <span className="text-[9px] tabular-nums opacity-70">
            ({news.loading ? "…" : data
              ? data.counts.matched + data.counts.incidents + data.counts.press
              : 0})
          </span>
        </div>
      </div>

      {/* Tabs — centered row */}
      <div className="flex items-center justify-center gap-1 mb-3">
        {(
          [
            { v: "matched", label: lang === "pt" ? "Combinadas" : "Matched", count: matched.length + incidents.length, badge: matched.length > 0 },
            { v: "press", label: lang === "pt" ? "Imprensa" : "Press", count: press.length },
            { v: "sources", label: lang === "pt" ? "Fontes" : "Sources", count: sources.length },
          ] as const
        ).map((t2) => (
          <button
            key={t2.v}
            type="button"
            onClick={() => setTab(t2.v)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-medium uppercase tracking-wider transition-colors ${
              activeTab === t2.v
                ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)]"
                : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
            }`}
          >
            <span>{t2.label}</span>
            <span className="font-mono tabular-nums">{t2.count}</span>
            {t2.badge && (
              <span className="w-1 h-1 rounded-full bg-[var(--ember-accent)] animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-1.5 max-h-80 overflow-y-auto ember-scroll pr-1">
        {items.length === 0 ? (
          <EmptyState
            variant="no-news"
            lang={lang}
            onReset={activeTab === "matched" ? () => setTab("press") : undefined}
          />
        ) : (
          items.map((it) => {
            const Icon = CATEGORY_ICON[it.category] ?? Newspaper;
            const sevDot = it.severity ? SEVERITY_DOT[it.severity] : null;
            return (
              <a
                key={it.id}
                href={it.href ?? it.sourceUrl}
                target={it.href ? undefined : "_blank"}
                rel={it.href ? undefined : "noopener noreferrer"}
                className={`block rounded-md border p-2 transition-colors group ${
                  it.matched
                    ? "border-[var(--ember-accent)]/40 bg-[var(--ember-accent-subtle)]/40 hover:border-[var(--ember-accent)]"
                    : "border-[var(--ember-border)] bg-[var(--ember-surface-2)] hover:border-[var(--ember-border-strong)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  {sevDot ? (
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                      style={{ background: sevDot }}
                    />
                  ) : (
                    <Icon className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--ember-text-faint)]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[var(--ember-text)] leading-tight line-clamp-2 group-hover:text-[var(--ember-accent)] transition-colors">
                      {it.title}
                    </div>
                    {it.summary && activeTab !== "sources" && (
                      <div className="text-[10px] text-[var(--ember-text-faint)] mt-0.5 line-clamp-1">
                        {it.summary}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 text-[9px] text-[var(--ember-text-faint)]">
                      <span className="font-semibold uppercase tracking-wider">
                        {it.source}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {relTime(it.publishedAt, lang)}
                      </span>
                      {it.matched && (
                        <span className="ml-auto flex items-center gap-0.5 text-[var(--ember-accent)] font-semibold uppercase tracking-wider">
                          <Flame className="w-2.5 h-2.5" />{" "}
                          {lang === "pt" ? "combina" : "match"}
                        </span>
                      )}
                    </div>
                  </div>
                  {!it.href && (
                    <ExternalLink className="w-2.5 h-2.5 text-[var(--ember-text-faint)] flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}