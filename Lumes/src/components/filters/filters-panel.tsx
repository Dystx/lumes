"use client";
// FiltersPanel — UNIFIED FILTERS for lumes.pt.
//
// Single source of truth for all user-controlled filters:
//   - Search
//   - Severity checkboxes
//   - Source checkboxes
//   - Map layers (basemap, fire risk, fire stations, satellite, aerial, biomass, composite)
//   - Active filter chips
//   - Quick filter chips (ALL / ACTIVE / CRITICAL / HIGH)
//
// Replaces the previously scattered filters (sidebar panel, dashboard panel,
// layer panel, advanced layers) with one consistent UI. The component
// adapts to both desktop (sidebar-style) and mobile (bottom-sheet) layouts.
//
// Pattern: tabbed organization to prevent overwhelming the user:
//   [Essentials] [Layers] [Advanced]
// Essentials: search + severity + sources
// Layers: basemap + risk + stations
// Advanced: satellite + aerial + biomass + composite

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  X,
  Layers as LayersIcon,
  Sliders,
  Sparkles,
  Zap,
  MapPin,
  Radio,
  AlertTriangle,
  Plane,
  Trees,
  TrendingUp,
  Building2,
  Satellite,
  ChevronDown,
  RotateCcw,
  Moon,
  Eye,
} from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import type { Severity, SourceType } from "@/lib/incident-types";
import { FilterStatus, type FilterStatusItem } from "./filter-status";

export interface FiltersPanelProps {
  lang: Language;
  variant?: "desktop" | "mobile";
  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  // Quick filters
  quickFilter: "all" | "critical" | "high" | "active";
  setQuickFilter: (q: "all" | "critical" | "high" | "active") => void;
  // Severity
  severityFilter: Set<Severity>;
  toggleSeverity: (s: Severity) => void;
  criticalOnly: boolean;
  setCriticalOnly: (b: boolean) => void;
  hideResolved: boolean;
  setHideResolved: (b: boolean) => void;
  // Source
  visibleSources: Set<SourceType>;
  toggleSource: (s: SourceType) => void;
  // Map layers
  showFireRisk: boolean;
  setShowFireRisk: (b: boolean) => void;
  showFireStations: boolean;
  setShowFireStations: (b: boolean) => void;
  showSatellite: boolean;
  setShowSatellite: (b: boolean) => void;
  showAerial: boolean;
  setShowAerial: (b: boolean) => void;
  showBiomass: boolean;
  setShowBiomass: (b: boolean) => void;
  showCompositeRisk: boolean;
  setShowCompositeRisk: (b: boolean) => void;
  // Basemap
  basemap: "dark" | "light" | "sat";
  setBasemap: (b: "dark" | "light" | "sat") => void;
  // Data state
  fireRiskReady: boolean;
  fireRiskCount: number;
  fireStationsReady: boolean;
  fireStationsCount: number;
  satelliteReady: boolean;
  satelliteCount: number;
  sourceHealth: { sourceName: string; status: string }[];
  // Counts
  liveCount: number;
  // Active filter chips
  activeFilters?: { id: string; label: string; onClear: () => void }[];
}

type Tab = "essentials" | "layers" | "advanced";

export function FiltersPanel({
  lang,
  variant = "desktop",
  searchQuery,
  setSearchQuery,
  searchInputRef,
  quickFilter,
  setQuickFilter,
  severityFilter,
  toggleSeverity,
  criticalOnly,
  setCriticalOnly,
  hideResolved,
  setHideResolved,
  visibleSources,
  toggleSource,
  showFireRisk,
  setShowFireRisk,
  showFireStations,
  setShowFireStations,
  showSatellite,
  setShowSatellite,
  showAerial,
  setShowAerial,
  showBiomass,
  setShowBiomass,
  showCompositeRisk,
  setShowCompositeRisk,
  basemap,
  setBasemap,
  fireRiskReady,
  fireRiskCount,
  fireStationsReady,
  fireStationsCount,
  satelliteReady,
  satelliteCount,
  sourceHealth,
  liveCount,
  activeFilters = [],
}: FiltersPanelProps) {
  const [tab, setTab] = useState<Tab>("essentials");
  const [showSources, setShowSources] = useState(false);

  const isMobile = variant === "mobile";
  const sourceOk = sourceHealth.filter((s) => s.status === "ok").length;
  const sourceTotal = sourceHealth.length || 1;

  // Reset all filters
  const resetAll = () => {
    setSearchQuery("");
    setQuickFilter("all");
    setCriticalOnly(false);
    setHideResolved(false);
    severityFilter.forEach((s) => toggleSeverity(s));
    setShowFireRisk(false);
    setShowFireStations(false);
    setShowSatellite(false);
    setShowAerial(false);
    setShowBiomass(false);
    setShowCompositeRisk(false);
    setBasemap("dark");
  };

  const hasActiveFilters =
    searchQuery.length > 0 ||
    quickFilter !== "all" ||
    criticalOnly ||
    severityFilter.size > 0 ||
    showFireRisk ||
    showFireStations ||
    showSatellite ||
    showAerial ||
    showBiomass ||
    showCompositeRisk;

  return (
    <div className="flex flex-col h-full bg-[var(--ember-bg)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[var(--ember-accent-subtle)] flex items-center justify-center">
              <Sliders className="w-3.5 h-3.5 text-[var(--ember-accent)]" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[var(--ember-text)] leading-none">
                {lang === "pt" ? "Filtros" : "Filters"}
              </h2>
              <p className="text-[10px] text-[var(--ember-text-faint)] leading-none mt-1 tabular-nums">
                {liveCount} {lang === "pt" ? "incêndios" : "incidents"}
                {hasActiveFilters && (
                  <> · <span className="text-[var(--ember-accent)]">
                    {activeFilters.length} {lang === "pt" ? "ativos" : "active"}
                  </span></>
                )}
              </p>
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetAll}
              className="text-[10px] font-medium uppercase tracking-wider text-[var(--ember-text)] bg-[var(--ember-accent-subtle)] hover:bg-[var(--ember-accent)] hover:text-white border border-[var(--ember-accent)]/30 hover:border-[var(--ember-accent)] px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5"
              aria-label={lang === "pt" ? "Limpar todos os filtros" : "Reset all filters"}
            >
              <RotateCcw className="w-2.5 h-2.5" />
              {lang === "pt" ? "Limpar" : "Reset"}
            </button>
          )}
        </div>

        {/* Quick filter presets — one-tap common combinations */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {[
            { id: "critical", label: lang === "pt" ? "Só críticos" : "Critical only", icon: AlertTriangle,
              apply: () => { setQuickFilter("critical"); setCriticalOnly(true); } },
            { id: "active", label: lang === "pt" ? "Em curso" : "Active", icon: Radio,
              apply: () => { setQuickFilter("active"); setHideResolved(false); } },
            { id: "hideresolved", label: lang === "pt" ? "Esconder resolvidos" : "Hide resolved", icon: Eye,
              apply: () => { setHideResolved(true); } },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={preset.apply}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--ember-surface-2)] hover:bg-[var(--ember-accent-subtle)] border border-[var(--ember-border)] hover:border-[var(--ember-accent)] text-[10px] font-medium text-[var(--ember-text-muted)] hover:text-[var(--ember-accent)] transition-colors"
            >
              <preset.icon className="w-2.5 h-2.5" />
              {preset.label}
            </button>
          ))}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[var(--ember-surface-2)] p-0.5 rounded-md">
          {([
            { key: "essentials" as const, label: lang === "pt" ? "Essencial" : "Essentials" },
            { key: "layers" as const, label: lang === "pt" ? "Camadas" : "Layers" },
            { key: "advanced" as const, label: lang === "pt" ? "Avançado" : "Advanced" },
          ]).map((t2) => (
            <button
              key={t2.key}
              onClick={() => setTab(t2.key)}
              className={`flex-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
                tab === t2.key
                  ? "bg-[var(--ember-surface)] text-[var(--ember-text)] shadow-sm"
                  : "text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
              }`}
            >
              {t2.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <FilterStatus
          lang={lang}
          items={activeFilters.map((f) => ({
            id: f.id,
            label: f.label,
            onClear: f.onClear,
            category: f.category,
          }))}
          onClearAll={resetAll}
          liveCount={liveCount}
          totalCount={liveCount}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto ember-scroll">
        {tab === "essentials" && (
          <div className="p-4 space-y-5">
            {/* Search */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">
                {lang === "pt" ? "Pesquisar" : "Search"}
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ember-text-faint)] pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === "pt" ? "Nome, município…" : "Name, municipality…"}
                  aria-label={lang === "pt" ? "Pesquisar localização" : "Search location"}
                  autoComplete="off"
                  className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md pl-7 pr-7 py-1.5 text-xs text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ember-accent)]/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)]"
                    aria-label={t(lang, "a11y.clearSearch")}
                  >
                    <X className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick filter chips */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">
                {lang === "pt" ? "Filtro rápido" : "Quick filter"}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { v: "all" as const, label: t(lang, "dashboard.quickFilterAll") },
                  { v: "active" as const, label: t(lang, "dashboard.quickFilterActive") },
                  { v: "critical" as const, label: t(lang, "dashboard.quickFilterCritical") },
                  { v: "high" as const, label: t(lang, "dashboard.quickFilterHigh") },
                ]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setQuickFilter(opt.v)}
                    className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap transition-colors border ${
                      quickFilter === opt.v
                        ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)] text-[var(--ember-accent)]"
                        : "bg-transparent border-[var(--ember-border)] text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity checkboxes */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-1.5 block">
                {lang === "pt" ? "Severidade" : "Severity"}
              </label>
              <div className="space-y-1">
                {(["critical", "high", "medium", "low"] as Severity[]).map((s) => {
                  const color =
                    s === "critical" ? "var(--ember-critical)" :
                    s === "high" ? "var(--ember-warning)" :
                    s === "medium" ? "var(--ember-info)" :
                    "var(--ember-success)";
                  const active = severityFilter.has(s);
                  const labels: Record<Severity, { pt: string; en: string }> = {
                    critical: { pt: "Crítico", en: "Critical" },
                    high: { pt: "Elevado", en: "High" },
                    medium: { pt: "Médio", en: "Medium" },
                    low: { pt: "Baixo", en: "Low" },
                  };
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSeverity(s)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--ember-surface-2)] transition-colors"
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 border-2"
                        style={{
                          background: active ? color : "transparent",
                          borderColor: color,
                        }}
                      />
                      <span className={`text-xs ${active ? "text-[var(--ember-text)] font-medium" : "text-[var(--ember-text-faint)]"}`}>
                        {labels[s][lang]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-1 pt-1">
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-[var(--ember-surface-2)]">
                <input
                  type="checkbox"
                  checked={criticalOnly}
                  onChange={(e) => setCriticalOnly(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--ember-critical)]"
                />
                <span className="text-xs text-[var(--ember-text)]">
                  {lang === "pt" ? "Apenas críticos" : "Critical only"}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-[var(--ember-surface-2)]">
                <input
                  type="checkbox"
                  checked={hideResolved}
                  onChange={(e) => setHideResolved(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--ember-accent)]"
                />
                <span className="text-xs text-[var(--ember-text)]">
                  {lang === "pt" ? "Ocultar resolvidos" : "Hide resolved"}
                </span>
              </label>
            </div>

            {/* Data sources */}
            <div className="pt-2">
              <button
                onClick={() => setShowSources(!showSources)}
                className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-1.5 hover:text-[var(--ember-text-muted)]"
              >
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3" />
                  {lang === "pt" ? "Fontes" : "Sources"}
                  <span className="text-[var(--ember-text-faint)]">({sourceOk}/{sourceTotal})</span>
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showSources ? "rotate-180" : ""}`} />
              </button>
              {showSources && (
                <div className="space-y-1 pl-2">
                  {(["satellite", "official", "community", "news", "weather"] as SourceType[]).map((st) => {
                    const srcs: Record<SourceType, { pt: string; en: string; color: string }> = {
                      satellite: { pt: "Satélite", en: "Satellite", color: "var(--ember-source-satellite)" },
                      official: { pt: "Oficial", en: "Official", color: "var(--ember-source-official)" },
                      community: { pt: "Comunidade", en: "Community", color: "var(--ember-source-community)" },
                      news: { pt: "Notícias", en: "News", color: "var(--ember-source-news)" },
                      weather: { pt: "Meteo", en: "Weather", color: "var(--ember-source-weather)" },
                    };
                    const active = visibleSources.has(st);
                    return (
                      <label key={st} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-[var(--ember-surface-2)]">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleSource(st)}
                          className="w-3.5 h-3.5 accent-[var(--ember-accent)]"
                        />
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: srcs[st].color }} />
                        <span className="text-[10px] text-[var(--ember-text)] uppercase tracking-wider">
                          {srcs[st][lang]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "layers" && (
          <div className="p-4 space-y-5">
            {/* Basemap */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">
                {lang === "pt" ? "Mapa base" : "Basemap"}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { v: "dark" as const, label: t(lang, "sidebar.dark"), icon: Moon },
                  { v: "light" as const, label: t(lang, "sidebar.light"), icon: Sparkles },
                  { v: "sat" as const, label: t(lang, "sidebar.sat"), icon: Satellite },
                ]).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => setBasemap(opt.v)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-md border text-[10px] font-medium transition-colors ${
                        basemap === opt.v
                          ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)] text-[var(--ember-accent)]"
                          : "bg-transparent border-[var(--ember-border)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fire risk */}
            <LayerToggle
              icon={TrendingUp}
              label={t(lang, "sidebar.fireRiskLayer")}
              sublabel={fireRiskReady
                ? `${fireRiskCount} ${lang === "pt" ? "concelhos" : "municipalities"}`
                : t(lang, "common.loading")}
              enabled={showFireRisk}
              onToggle={() => setShowFireRisk(!showFireRisk)}
              lang={lang}
            />
            <LayerToggle
              icon={Building2}
              label={t(lang, "sidebar.fireStations")}
              sublabel={fireStationsReady
                ? `${fireStationsCount} ${lang === "pt" ? "quartéis" : "stations"}`
                : t(lang, "common.loading")}
              enabled={showFireStations}
              onToggle={() => setShowFireStations(!showFireStations)}
              lang={lang}
            />
          </div>
        )}

        {tab === "advanced" && (
          <div className="p-4 space-y-3">
            <p className="text-[10px] text-[var(--ember-text-faint)] italic mb-2">
              {lang === "pt" ? "Camadas avançadas — combinam dados meteorológicos, satélite e operacionais" : "Advanced layers — combine weather, satellite, and operational data"}
            </p>
            <LayerToggle
              icon={Satellite}
              label={t(lang, "dataSources.nasa-firms-viirs")}
              sublabel={satelliteReady
                ? satelliteCount > 0
                  ? `${satelliteCount} ${lang === "pt" ? "focos (48h)" : "detections (48h)"}`
                  : lang === "pt" ? "Ativar para carregar" : "Enable to load"
                : t(lang, "common.loading")}
              enabled={showSatellite}
              onToggle={() => setShowSatellite(!showSatellite)}
              lang={lang}
            />
            <LayerToggle
              icon={Plane}
              label={t(lang, "aerial.response")}
              sublabel={lang === "pt" ? "ADS-B" : "ADS-B"}
              enabled={showAerial}
              onToggle={() => setShowAerial(!showAerial)}
              lang={lang}
            />
            <LayerToggle
              icon={Trees}
              label={t(lang, "biomass.fuel")}
              sublabel={t(lang, "biomass.combustion")}
              enabled={showBiomass}
              onToggle={() => setShowBiomass(!showBiomass)}
              lang={lang}
            />
            <LayerToggle
              icon={Zap}
              label={t(lang, "composite.label")}
              sublabel={t(lang, "biomass.biomassMeteo")}
              enabled={showCompositeRisk}
              onToggle={() => setShowCompositeRisk(!showCompositeRisk)}
              lang={lang}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LayerToggle({
  icon: Icon,
  label,
  sublabel,
  enabled,
  onToggle,
  lang,
}: {
  icon: typeof Zap;
  label: string;
  sublabel: string;
  enabled: boolean;
  onToggle: () => void;
  lang: Language;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
        enabled
          ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]/30"
          : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
      }`}
      aria-pressed={enabled}
    >
      <span
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
          enabled ? "bg-[var(--ember-accent)] text-white" : "bg-[var(--ember-surface)] text-[var(--ember-text-muted)]"
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-[var(--ember-text)] truncate">
          {label}
        </div>
        <div className="text-[10px] text-[var(--ember-text-faint)] truncate">
          {sublabel}
        </div>
      </div>
      <div
        className={`w-7 h-4 rounded-full flex-shrink-0 relative transition-colors ${
          enabled ? "bg-[var(--ember-accent)]" : "bg-[var(--ember-border)]"
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}