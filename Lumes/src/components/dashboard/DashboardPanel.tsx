"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { t, type Language } from "@/lib/i18n";
import { DashStat, ResourceStat } from "@/components/dashboard/stat-card";
import { HeroCounter } from "@/components/dashboard/hero-counter";
import { OperationalPhases } from "@/components/dashboard/operational-phases";
import { EmberIcon } from "@/components/icons/brand-icons";
import {
  Clock,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  TrendingUp,
  Users,
  Plane,
  Trees,
  Truck,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Bookmark,
  ChevronDown,
  Zap,
  Layers,
  Activity,
  History as HistoryIcon,
  Flame,
  Bell,
  X,
} from "@/components/icons/phosphor-icons";
import {
  AnimatedButton,
  StaggerChildren,
  StaggerItem,
  Skeleton,
  ScalePresence,
} from "@/components/ember-anim";
import { SectionError } from "@/components/ui/section-error";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusIndicator } from "@/components/ui/status-indicator";
import type { DashboardPriorityIncident, HistoryIncident, PersistenceStatsCounts, SourceHealth, SourceType, Severity } from "@/lib/types";
import type { IncidentSort, QuickFilter } from "@/store/ui-store";
import {
  type Incident,
} from "@/lib/sample-data";
import { filterFollowedIncidents } from "@/lib/use-followed-incidents";
import { getUnreadFollowedIncidents, type ReadableFollowedIncident } from "@/lib/followed-read-state";

function timeAgo(iso: string): string {
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Full body moved from src/app/page.tsx (NS-1 extraction)
function DashboardPanel({
  metrics,
  topIncidents,
  recentHistory,
  onSelectIncident,
  onSelectHistoryIncident,
  onOpenHistory,
  sourceHealth,
  realtimeConnected,
  persistenceStats,
  usingFallback,
  allIncidents,
  sortMode,
  setSortMode,
  quickFilter,
  setQuickFilter,
  phaseFilter,
  setPhaseFilter,
  resourceFilter,
  setResourceFilter,
  hideResolved,
  setHideResolved,
  severityFilter,
  toggleSeverity,
  visibleSources,
  toggleSource,
  selectedIncidentId,
  followedIncidentIds,
  followedReadState,
  onMarkFollowingSeen,
  activeFilterCount = 0,
  onClearIncidentFilters,
  loading,
  lang,
  dataFetchedAt,
  dashboardError,
  onRetryDashboard,
  mode = "situation",
}: {
  metrics: {
    total: number;
    activeCount: number;
    criticalCount: number;
    highCount: number;
    personnel: number;
    aircraft: number;
    engines: number;
    areaHa: number;
    byType: Record<string, number>;
    byStatusGroup?: Record<string, number>;
  };
  topIncidents: Array<Incident | DashboardPriorityIncident>;
  recentHistory: HistoryIncident[];
  onSelectIncident: (id: string) => void;
  onSelectHistoryIncident?: (incident: HistoryIncident) => void;
  onOpenHistory: () => void;
  sourceHealth: SourceHealth[];
  realtimeConnected: boolean;
  persistenceStats: PersistenceStatsCounts | null;
  usingFallback: boolean;
  allIncidents: Incident[];
  sortMode: "recent" | "severity" | "area" | "personnel";
  setSortMode: (s: "recent" | "severity" | "area" | "personnel") => void;
  quickFilter: "all" | "critical" | "high" | "active";
  setQuickFilter: (q: "all" | "critical" | "high" | "active") => void;
  selectedIncidentId: string | null;
  followedIncidentIds: Set<string>;
  followedReadState: ReadonlyMap<string, string>;
  onMarkFollowingSeen?: (incidents: readonly ReadableFollowedIncident[]) => void;
  /** Explicitly clears the shared query filters; selection remains local to this view. */
  activeFilterCount?: number;
  onClearIncidentFilters?: () => void;
  loading: boolean;
  dashboardError?: boolean;
  onRetryDashboard?: () => void;
  phaseFilter: string | null;
  setPhaseFilter: (p: string | null) => void;
  resourceFilter: "personnel" | "engines" | "aircraft" | null;
  setResourceFilter: (r: "personnel" | "engines" | "aircraft" | null) => void;
  hideResolved: boolean;
  setHideResolved: (v: boolean | ((p: boolean) => boolean)) => void;
  severityFilter: Set<Severity>;
  toggleSeverity: (s: Severity) => void;
  visibleSources: Set<SourceType>;
  toggleSource: (s: SourceType) => void;
  lang: Language;
  dataFetchedAt: Date | null;
  /** Situation keeps the rail focused on immediate awareness. */
  mode?: "situation" | "full";
}) {
  const isSituation = mode === "situation";
  const [activityTab, setActivityTab] = useState<"critical" | "recent" | "all" | "following">("critical");
  const okSources = sourceHealth.filter((s) => s.status === "ok").length;
  const totalSources = sourceHealth.length || 1;
  const healthPct = Math.round((okSources / totalSources) * 100);

  // Top 5 type entries for the distribution chart
  const typeEntries = useMemo(() => {
    return Object.entries(metrics.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [metrics.byType]);
  const maxTypeCount = typeEntries.length > 0 ? typeEntries[0][1] : 1;

  // Top districts by incident count (from allIncidents)
  const topDistrictBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inc of allIncidents) {
      const district = inc.district;
      if (district) counts[district] = (counts[district] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [allIncidents]);

  // Sorted + filtered incidents for "All" tab
  const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedAllIncidents = useMemo(() => {
    let pool = allIncidents;
    if (quickFilter === "critical") pool = pool.filter((i) => i.severity === "critical");
    else if (quickFilter === "high") pool = pool.filter((i) => i.severity === "critical" || i.severity === "high");
    else if (quickFilter === "active") pool = pool.filter((i) => i.status === "active" || i.status === "detected");

    const sorted = [...pool];
    switch (sortMode) {
      case "severity":
        sorted.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
        break;
      case "area":
        sorted.sort((a, b) => (b.estimatedAreaHa || 0) - (a.estimatedAreaHa || 0));
        break;
      case "personnel":
        sorted.sort((a, b) => (b.personnel || 0) - (a.personnel || 0));
        break;
      case "recent":
      default:
        sorted.sort(
          (a, b) =>
            new Date(b.firstDetected || b.lastUpdated || 0).getTime() -
            new Date(a.firstDetected || a.lastUpdated || 0).getTime()
        );
    }
    return sorted;
  }, [allIncidents, sortMode, quickFilter]);

  const followedIncidents = useMemo(
    () => filterFollowedIncidents(sortedAllIncidents, followedIncidentIds),
    [followedIncidentIds, sortedAllIncidents],
  );
  const unreadFollowedIncidents = useMemo(
    () => getUnreadFollowedIncidents(sortedAllIncidents, followedIncidentIds, followedReadState),
    [followedIncidentIds, followedReadState, sortedAllIncidents],
  );
  const followingEntryRef = useRef(false);

  useEffect(() => {
    if (activityTab !== "following") {
      followingEntryRef.current = false;
      return;
    }
    if (!followingEntryRef.current && followedIncidents.length > 0) {
      followingEntryRef.current = true;
      onMarkFollowingSeen?.(followedIncidents);
    }
  }, [activityTab, followedIncidents, followedReadState, onMarkFollowingSeen]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-full h-full flex-col bg-[var(--ember-bg)] flex-shrink-0 z-20 relative"
    >
      {/* Header — section title + live status (brand is in the top header) */}
      <div className="px-4 py-4 border-b border-[var(--ember-border)] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[var(--ember-accent-subtle)] flex items-center justify-center">
              <EmberIcon className="w-4 h-4 text-[var(--ember-accent)]" />
            </div>
            <div>
              <h2
                className="text-[15px] font-semibold text-[var(--ember-text)] leading-none tracking-tight"
                style={{ fontVariationSettings: "'opsz' 14" }}
              >
                {t(lang, "dashboard.title")}
              </h2>
              <p className="text-[length:var(--type-secondary)] text-[var(--ember-text-faint)] leading-none mt-1">
                {t(lang, "dashboard.subtitle")}
              </p>
            </div>
          </div>
          <StatusIndicator
            state={realtimeConnected ? "live" : usingFallback ? "fallback" : "empty"}
            pulse={false}
            label={realtimeConnected ? t(lang, "live.rt") : usingFallback ? t(lang, "live.fb") : t(lang, "live.live")}
          />
        </div>
      </div>

      {/* Scrollable body */}
      {/* The embedding mobile sheet owns vertical scrolling; keep this body
          non-scrollable so nested scroll containers cannot fight gestures. */}
      <div className="flex-1 min-h-0">
        {loading && metrics.total === 0 ? (
          /* Loading skeleton — shown while /api/dashboard fetches */
          <div className="px-4 py-4 space-y-4">
            <div>
              <Skeleton width="80px" height={10} className="mb-2.5" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] p-2.5">
                    <Skeleton width="40px" height={9} className="mb-1" />
                    <Skeleton width="32px" height={20} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Skeleton width="100px" height={10} className="mb-2.5" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] p-2">
                    <Skeleton width="14px" height={14} className="mx-auto mb-1" />
                    <Skeleton width="24px" height={16} className="mx-auto" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Skeleton width="120px" height={10} className="mb-2" />
              <div className="space-y-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-md border border-[var(--ember-border)]">
                    <Skeleton width={8} height={8} className="rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton width="60%" height={10} />
                      <Skeleton width="40%" height={8} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Skeleton width="100px" height={10} className="mb-2" />
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-2.5 rounded-md border border-[var(--ember-border)]">
                    <Skeleton width="80%" height={10} className="mb-1" />
                    <Skeleton width="50%" height={8} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : !loading && metrics.total === 0 ? (
          // Empty state — no incidents at all
          <div className="px-4 py-8">
            <div className="flex flex-col items-center justify-center text-center gap-2">
              <div className="w-14 h-14 rounded-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] flex items-center justify-center">
                <Flame className="w-6 h-6 text-[var(--ember-text-faint)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ember-text)]">
                {t(lang, "error.noIncidents")}
              </h3>
              <p className="text-xs text-[var(--ember-text-muted)] leading-relaxed max-w-xs">
                {t(lang, "error.noIncidentsDesc")}
              </p>
            </div>
          </div>
        ) : (
        <>

        {/* Hero metric — large primary number for at-a-glance awareness.
            Each counter is clickable to filter the priority list. */}
         <div className="px-4 pt-4 pb-3 border-b border-[var(--ember-border)]">
           <div className="flex items-end gap-3">
            <HeroCounter
              label={lang === "pt" ? "Total" : "Total"}
              value={metrics.total}
              icon={Flame}
              color="var(--ember-text)"
              hint={t(lang, "map.totalLabel")}
              caption={dataFetchedAt ? `${lang === "pt" ? "Atualizado" : "Updated"} ${timeAgo(typeof dataFetchedAt === "string" ? dataFetchedAt : dataFetchedAt.toISOString())}` : undefined}
              active={quickFilter === "all"}
              onClick={() => { setQuickFilter("all"); }}
              isLoading={loading}
            />
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              <HeroCounter
                label={lang === "pt" ? "Ativos" : "Active"}
                value={metrics.activeCount}
                icon={Radio}
                color="var(--ember-critical)"
                pulse={false}
                active={quickFilter === "active"}
                onClick={() => { setQuickFilter(quickFilter === "active" ? "all" : "active"); }}
                isLoading={loading}
              />
              <HeroCounter
                label={t(lang, "dashboard.critical")}
                value={metrics.criticalCount}
                icon={AlertTriangle}
                color="var(--ember-critical)"
                active={quickFilter === "critical"}
                onClick={() => {
                  if (quickFilter === "critical") {
                    setQuickFilter("all");
                  } else {
                    setQuickFilter("critical");
                  }
                }}
                isLoading={loading}
              />
            </div>
           </div>
         </div>

         {!isSituation && (
           <div className="px-4 pt-3 md:hidden">
             <button
               type="button"
               data-testid="dashboard-following-mobile-toggle"
               aria-pressed={activityTab === "following"}
               onClick={() => setActivityTab(activityTab === "following" ? "critical" : "following")}
               className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left text-xs transition-colors ${
                 activityTab === "following"
                   ? "border-[var(--ember-accent)] bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)]"
                   : "border-[var(--ember-border)] bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] hover:border-[var(--ember-accent)]"
               }`}
             >
               <span className="flex items-center gap-2">
                 <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                 {activityTab === "following"
                   ? t(lang, "dashboard.activityPriority")
                   : t(lang, "dashboard.activityFollowing")}
               </span>
               <span className="flex items-center gap-2 font-mono tabular-nums">
                 {unreadFollowedIncidents.length > 0 && (
                   <span
                     data-testid="dashboard-following-mobile-unread-count"
                     className="rounded-full bg-[var(--ember-critical)] px-1.5 py-0.5 text-meta font-bold text-white"
                   >
                     {unreadFollowedIncidents.length}
                   </span>
                 )}
                 {followedIncidents.length}
               </span>
             </button>
           </div>
         )}

         {/* Top districts breakdown — replaces duplicate stats grid.
            Shows which districts have the most active fires. */}
        <div className={`${isSituation ? "hidden" : "px-4 py-4 border-b border-[var(--ember-border)] space-y-2"}`}>
          <div className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2">
            {lang === "pt" ? "Distritos mais ativos" : "Top districts"}
          </div>
          {topDistrictBreakdown.length === 0 ? (
            <p className="text-[11px] text-[var(--ember-text-faint)]">
              {lang === "pt" ? "Sem dados" : "No data"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {topDistrictBreakdown.map((d) => {
                const max = topDistrictBreakdown[0]?.count ?? 1;
                const pct = (d.count / max) * 100;
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => {
                      /* setSearchQuery(d.name) — search setter not wired to panel; cast not applicable for name */
                    }}
                    className="w-full flex items-center gap-2 group"
                  >
                    <span className="text-meta text-[var(--ember-text)] w-20 truncate text-left group-hover:text-[var(--ember-accent)] transition-colors">
                      {d.name}
                    </span>
                    <div className="flex-1 h-1.5 bg-[var(--ember-surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--ember-accent)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-meta font-mono tabular-nums text-[var(--ember-text-faint)] w-6 text-right">
                      {d.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resources deployed */}
        <div className={`${isSituation ? "hidden" : "px-4 py-4 border-b border-[var(--ember-border)] space-y-2.5"}`}>
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
              {t(lang, "dashboard.resourcesDeployed")}
            </div>
            {resourceFilter && (
              <button
                type="button"
                onClick={() => setResourceFilter(null)}
                className="text-meta text-[var(--ember-accent)] hover:underline flex items-center gap-1"
              >
                <X className="w-2.5 h-2.5" /> {lang === "pt" ? "Limpar" : "Clear"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ResourceStat
              icon={Users}
              value={metrics.personnel}
              label={lang === "pt" ? "Operacionais" : "Personnel"}
              active={resourceFilter === "personnel"}
              onClick={() => setResourceFilter(resourceFilter === "personnel" ? null : "personnel")}
            />
            <ResourceStat
              icon={Truck}
              value={metrics.engines}
              label={lang === "pt" ? "Veículos" : "Engines"}
              active={resourceFilter === "engines"}
              onClick={() => setResourceFilter(resourceFilter === "engines" ? null : "engines")}
            />
            <ResourceStat
              icon={Plane}
              value={metrics.aircraft}
              label={lang === "pt" ? "Aeronaves" : "Aircraft"}
              active={resourceFilter === "aircraft"}
              onClick={() => setResourceFilter(resourceFilter === "aircraft" ? null : "aircraft")}
            />
          </div>
          {metrics.areaHa > 0 && (
            <div className="mt-2 px-3 py-2 rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] flex items-center justify-between">
              <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                Total area burned
              </span>
              <span className="text-sm font-mono font-bold text-[var(--ember-critical)]">
                {metrics.areaHa < 1
                  ? `${Math.round(metrics.areaHa * 100) / 100}`
                  : metrics.areaHa.toLocaleString()}{" "}
                <span className="text-meta text-[var(--ember-text-faint)]">ha</span>
              </span>
            </div>
          )}
        </div>

        {/* Operational phases (EstadoAgrupado) — all raw ANEPC statuses */}
        <div data-phone-hidden="true">
          {!isSituation && ((dashboardError && metrics.total === 0) ? (
            <SectionError
              title={lang === "pt" ? "Fases indisponíveis" : "Phases unavailable"}
              onRetry={onRetryDashboard}
            />
          ) : (
            <OperationalPhases
              byStatusGroup={metrics.byStatusGroup ?? {}}
              phaseFilter={phaseFilter}
              setPhaseFilter={setPhaseFilter}
              lang={lang}
            />
          ))}
        </div>

        {/* Tabs — Priority / Recent / All */}
        <div data-phone-hidden="true" className={`${isSituation ? "hidden" : "px-4 pt-3 border-b border-[var(--ember-border)]"}`}>
          <div className="flex gap-4">
            {([
              { v: "critical", label: t(lang, "dashboard.activityPriority") },
              { v: "recent", label: t(lang, "dashboard.activityRecent") },
              { v: "all", label: t(lang, "dashboard.activityAll") },
              { v: "following", label: t(lang, "dashboard.activityFollowing") },
            ] as { v: "critical" | "recent" | "all" | "following"; label: string }[]).map((tab) => (
              <button
                key={tab.v}
                type="button"
                data-testid={tab.v === "following" ? "dashboard-following-tab" : undefined}
                onClick={() => setActivityTab(tab.v)}
                className={`pb-2 text-[11px] uppercase tracking-wider font-medium border-b-2 transition-colors ${
                  activityTab === tab.v
                    ? "border-[var(--ember-accent)] text-[var(--ember-text)]"
                    : "border-transparent text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
                }`}
              >
                {tab.label}
                {tab.v === "following" && followedIncidents.length > 0 && (
                  <span className="ml-1 font-mono tabular-nums">{followedIncidents.length}</span>
                )}
                {tab.v === "following" && unreadFollowedIncidents.length > 0 && (
                  <span
                    data-testid="dashboard-following-unread-count"
                    className="ml-1 rounded-full bg-[var(--ember-critical)] px-1.5 py-0.5 text-meta font-bold text-white"
                  >
                    {unreadFollowedIncidents.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Incident list — priority or recent or all */}
        <div className="px-4 py-4 space-y-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={activityTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
          {activityTab === "critical" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  {t(lang, "dashboard.topPriority")}
                </span>
                {topIncidents.length > 0 && (
                  <span className="text-meta text-[var(--ember-text-faint)] tabular-nums">
                    {topIncidents.length} {t(lang, "dashboard.total")}
                  </span>
                )}
              </div>
              {topIncidents.length === 0 ? (
                <div className="text-[11px] text-[var(--ember-text-faint)] text-center py-4">
                  {t(lang, "error.noPriorityDesc")}
                </div>
              ) : (
                <StaggerChildren stagger={0.04} className="space-y-1">
                  {topIncidents.map((inc) => (
                    <StaggerItem key={inc.id}>
                      <motion.button
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelectIncident(inc.id)}
                        data-testid="dashboard-priority-incident"
                        className="w-full text-left p-2.5 rounded-md border border-[var(--ember-border)] hover:border-[var(--ember-accent)] hover:bg-[var(--ember-surface-2)] transition-all group"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${inc.severity === "critical" ? "ember-glow-critical animate-pulse" : ""}`}
                            style={{
                              background:
                                inc.severity === "critical" ? "var(--ember-critical)"
                                : inc.severity === "high" ? "var(--ember-warning)"
                                : inc.severity === "medium" ? "var(--ember-info)"
                                : "var(--ember-success)",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[var(--ember-text)] truncate group-hover:text-[var(--ember-accent)] transition-colors">
                              {inc.displayName}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 text-meta text-[var(--ember-text-faint)]">
                              <span
                                className="uppercase tracking-wider font-semibold"
                                style={{
                                  color:
                                    inc.severity === "critical" ? "var(--ember-critical)"
                                    : inc.severity === "high" ? "var(--ember-warning)"
                                    : "var(--ember-info)",
                                }}
                              >
                                {inc.severity}
                              </span>
                              <span>·</span>
                              <span className="truncate">{inc.municipality || inc.district || "—"}</span>
                            </div>
                            {(inc.estimatedAreaHa > 0 || inc.personnel > 0) && (
                              <div className="flex items-center gap-2 mt-1 text-meta font-mono text-[var(--ember-text-faint)]">
                                {inc.estimatedAreaHa > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <TrendingUp className="w-2 h-2" />
                                    {inc.estimatedAreaHa < 1
                                      ? `${Math.round(inc.estimatedAreaHa * 100) / 100}ha`
                                      : `${Math.round(inc.estimatedAreaHa)}ha`}
                                  </span>
                                )}
                                {inc.personnel > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <Users className="w-2 h-2" />
                                    {inc.personnel}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-3 h-3 text-[var(--ember-text-faint)] group-hover:text-[var(--ember-accent)] transition-colors flex-shrink-0 mt-1" />
                        </div>
                      </motion.button>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              )}
              {topIncidents.length >= 5 && (
                <button
                  onClick={onOpenHistory}
                  className="w-full mt-2 px-3 py-2 rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-accent)] hover:bg-[var(--ember-accent-subtle)] transition-all text-[11px] text-[var(--ember-text-muted)] hover:text-[var(--ember-accent)] flex items-center justify-center gap-1.5 group"
                >
                  <span className="uppercase tracking-wider font-medium">{t(lang, "dashboard.viewAll")}</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </>
          ) : activityTab === "recent" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  Recent Activity
                </span>
                <button
                  onClick={onOpenHistory}
                  className="text-meta text-[var(--ember-accent)] hover:underline"
                >
                  View all →
                </button>
              </div>
              {recentHistory.length === 0 ? (
                <div className="text-[11px] text-[var(--ember-text-faint)] text-center py-4">
                  No recent activity yet.
                </div>
              ) : (
                <StaggerChildren stagger={0.03} className="space-y-1">
                  {recentHistory.slice(0, 8).map((inc) => (
                    <StaggerItem key={inc.id}>
                      <motion.button
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (onSelectHistoryIncident) {
                            onSelectHistoryIncident(inc);
                          } else {
                            onSelectIncident(inc.id);
                          }
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-md border border-transparent hover:bg-[var(--ember-surface-2)] hover:border-[var(--ember-border)] transition-all text-left"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background:
                              inc.severity === "critical" ? "var(--ember-critical)"
                              : inc.severity === "high" ? "var(--ember-warning)"
                              : inc.severity === "medium" ? "var(--ember-info)"
                              : "var(--ember-success)",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-[var(--ember-text)] truncate">
                            {inc.displayName}
                          </div>
                          <div className="text-meta text-[var(--ember-text-faint)] truncate">
                            {inc.municipality || "—"} · {inc.status}
                          </div>
                        </div>
                        <span className="text-meta font-mono text-[var(--ember-text-faint)] flex-shrink-0">
                          {timeAgo(inc.firstDetected)}
                        </span>
                      </motion.button>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              )}
            </>
          ) : (
            <>
              {/* All incidents tab — sort + filter + full list */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  {activityTab === "following"
                    ? t(lang, "dashboard.activityFollowing")
                    : lang === "pt" ? "Incidentes visíveis" : "Visible incidents"}
                </span>
                <span className="flex items-center gap-2 text-meta font-mono text-[var(--ember-text-faint)]">
                  {activityTab === "following" && unreadFollowedIncidents.length > 0 && (
                    <span
                      data-testid="dashboard-following-unread-count"
                      className="rounded-full bg-[var(--ember-critical)] px-1.5 py-0.5 text-meta font-bold text-white"
                      title={`${unreadFollowedIncidents.length} ${t(lang, "dashboard.activityFollowingUnread")}`}
                    >
                      {unreadFollowedIncidents.length}
                    </span>
                  )}
                  {activityTab === "following" ? followedIncidents.length : sortedAllIncidents.length}
                </span>
              </div>
              {activityTab !== "following" && (
                <>
                  {/* Quick filter chips */}
                  <div className="flex items-center gap-1 mb-2 overflow-x-auto ember-scroll-x">
                    {([
                      { v: "all", label: t(lang, "dashboard.quickFilterAll") },
                      { v: "critical", label: t(lang, "dashboard.quickFilterCritical") },
                      { v: "high", label: t(lang, "dashboard.quickFilterHigh") },
                      { v: "active", label: t(lang, "dashboard.quickFilterActive") },
                    ] as { v: "all" | "critical" | "high" | "active"; label: string }[]).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setQuickFilter(opt.v)}
                        className={`px-2 py-0.5 rounded-full text-meta uppercase tracking-wider font-semibold whitespace-nowrap transition-colors border ${
                          quickFilter === opt.v
                            ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]/40 text-[var(--ember-accent)]"
                            : "bg-transparent border-[var(--ember-border)] text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {/* Sort dropdown */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex-shrink-0">
                      Sort
                    </span>
                    <div className="relative flex-1">
                      <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as "recent" | "severity" | "area" | "personnel")}
                        className="w-full appearance-none bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded px-2 py-1 text-meta text-[var(--ember-text)] focus:border-[var(--ember-accent)] focus:outline-none cursor-pointer pr-5"
                      >
                        <option value="recent">{lang === "pt" ? "Mais recentes" : "Most recent"}</option>
                        <option value="severity">{lang === "pt" ? "Severidade" : "Severity"}</option>
                        <option value="area">{lang === "pt" ? "Maior área" : "Largest area"}</option>
                        <option value="personnel">{lang === "pt" ? "Mais operacionais" : "Most personnel"}</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ember-text-faint)] pointer-events-none" />
                    </div>
                  </div>
                </>
              )}
              {/* List */}
              {followedIncidents.length === 0 && activityTab === "following" ? (
                <div
                  data-testid={followedIncidentIds.size === 0 ? "dashboard-following-empty" : "dashboard-following-no-match"}
                  className="px-2 py-5 text-center"
                >
                  <Bell className="mx-auto mb-2 h-5 w-5 text-[var(--ember-text-faint)]" />
                  <h3 className="text-xs font-semibold text-[var(--ember-text)]">
                    {followedIncidentIds.size === 0 ? t(lang, "error.noFollowed") : t(lang, "error.noFollowedMatch")}
                  </h3>
                  <p className="mt-1 text-meta leading-relaxed text-[var(--ember-text-muted)]">
                    {followedIncidentIds.size === 0 ? t(lang, "error.noFollowedDesc") : t(lang, "error.noFollowedMatchDesc")}
                  </p>
                  {followedIncidentIds.size > 0 && activeFilterCount > 0 && onClearIncidentFilters && (
                    <button
                      type="button"
                      data-testid="dashboard-following-clear-filters"
                      onClick={onClearIncidentFilters}
                      className="mt-3 min-h-11 rounded-md border border-[var(--ember-accent)]/40 bg-[var(--ember-accent-subtle)] px-3 text-meta font-semibold uppercase tracking-wider text-[var(--ember-accent)] transition-colors hover:border-[var(--ember-accent)]"
                    >
                      {t(lang, "filters.clear")}
                    </button>
                  )}
                </div>
              ) : (activityTab === "following" ? followedIncidents : sortedAllIncidents).length === 0 ? (
                <div className="px-2 py-3">
                  <EmptyState variant="no-results" lang={lang} compact />
                </div>
              ) : (
                <StaggerChildren stagger={0.012} className="space-y-0.5">
                  {(activityTab === "following" ? followedIncidents : sortedAllIncidents).map((inc) => {
                    const isSelected = inc.id === selectedIncidentId;
                    const isFollowed = followedIncidentIds.has(inc.id);
                    const sevColor =
                      inc.severity === "critical" ? "var(--ember-critical)"
                      : inc.severity === "high" ? "var(--ember-warning)"
                      : inc.severity === "medium" ? "var(--ember-info)"
                      : "var(--ember-success)";
                    const isActive = inc.status === "active" || inc.status === "detected";
                    return (
                      <StaggerItem key={inc.id}>
                        <motion.button
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.98 }}
                          data-testid={activityTab === "following" ? "dashboard-following-row" : undefined}
                          data-incident-id={activityTab === "following" ? inc.id : undefined}
                          onClick={() => onSelectIncident(inc.id)}
                          className={`w-full text-left p-2 rounded-md border transition-all ${
                            isSelected
                              ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]"
                              : "bg-transparent border-transparent hover:bg-[var(--ember-surface-2)] hover:border-[var(--ember-border)]"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${inc.severity === "critical" && isActive ? "ember-glow-critical" : ""} ${isActive ? "animate-pulse" : ""}`}
                              style={{ background: sevColor }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium text-[var(--ember-text)] truncate leading-tight">
                                {inc.displayName}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 text-meta text-[var(--ember-text-faint)]">
                                <span style={{ color: sevColor }} className="uppercase tracking-wider font-semibold">
                                  {inc.severity}
                                </span>
                                <span>·</span>
                                <span className="truncate">{inc.municipality || inc.district || "—"}</span>
                              </div>
                              {(inc.estimatedAreaHa > 0 || inc.personnel > 0) && (
                                <div className="flex items-center gap-2 mt-0.5 text-meta font-mono text-[var(--ember-text-faint)]">
                                  {inc.estimatedAreaHa > 0 && (
                                    <span className="flex items-center gap-0.5">
                                      <TrendingUp className="w-2 h-2" />
                                      {inc.estimatedAreaHa < 1
                                        ? `${Math.round(inc.estimatedAreaHa * 100) / 100}ha`
                                        : `${Math.round(inc.estimatedAreaHa)}ha`}
                                    </span>
                                  )}
                                  {inc.personnel > 0 && (
                                    <span className="flex items-center gap-0.5">
                                      <Users className="w-2 h-2" />
                                      {inc.personnel}
                                    </span>
                                  )}
                                  {isActive && (
                                    <span className="text-[var(--ember-critical)] font-semibold uppercase">· Live</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {isFollowed && (
                              <Bell className="w-2.5 h-2.5 text-[var(--ember-accent)] flex-shrink-0 mt-1" />
                            )}
                          </div>
                        </motion.button>
                      </StaggerItem>
                    );
                  })}
                </StaggerChildren>
              )}
            </>
          )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Distribution by type */}
        {!isSituation && typeEntries.length > 0 && (
          <div data-phone-hidden="true" className="px-4 py-3 border-t border-[var(--ember-border)]">
            <div className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2.5">
              Distribution by Type
            </div>
            <div className="space-y-1.5">
              {typeEntries.map(([type, count]) => {
                const pct = (count / maxTypeCount) * 100;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-meta text-[var(--ember-text-muted)] capitalize w-24 truncate">
                      {type.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-1.5 bg-[var(--ember-surface-2)] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-[var(--ember-accent)] to-[var(--ember-critical)] rounded-full"
                      />
                    </div>
                    <span className="text-meta font-mono text-[var(--ember-text-faint)] w-6 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Footer — system health */}
      <div className="px-4 py-3 border-t border-[var(--ember-border)] flex-shrink-0 space-y-2">
        {/* System health bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" />
              {t(lang, "dashboard.systemHealth")}
            </span>
            <span className="text-meta font-mono tabular-nums text-[var(--ember-text-muted)]">
              {okSources}/{totalSources} {t(lang, "sidebar.sources").toLowerCase()}
            </span>
          </div>
          <div className="h-1 bg-[var(--ember-surface-2)] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${healthPct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              role="progressbar"
              aria-valuenow={healthPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${okSources} ${lang === "pt" ? "de" : "of"} ${totalSources} ${t(lang, "sidebar.sources").toLowerCase()} ${lang === "pt" ? "operacionais" : "operational"} (${healthPct}%)`}
              className={`h-full rounded-full ${
                healthPct >= 75 ? "bg-[var(--ember-success)]"
                : healthPct >= 50 ? "bg-[var(--ember-warning)]"
                : "bg-[var(--ember-critical)]"
              }`}
            />
          </div>
        </div>
        {/* History quick link */}
        {!isSituation && persistenceStats && persistenceStats.total > 0 && (
          <button
            data-phone-hidden="true"
            onClick={onOpenHistory}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-accent)] transition-colors text-left group"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--ember-text-faint)] group-hover:text-[var(--ember-accent)] transition-colors" />
              <span className="text-[11px] text-[var(--ember-text-muted)] group-hover:text-[var(--ember-text)] transition-colors">
                Incident History
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-meta font-mono text-[var(--ember-text-faint)]">
                {persistenceStats.total.toLocaleString()}
              </span>
              <ChevronRight className="w-3 h-3 text-[var(--ember-text-faint)] group-hover:text-[var(--ember-accent)] transition-colors" />
            </div>
          </button>
        )}
      </div>
    </motion.aside>
  );
}




export { DashboardPanel };
