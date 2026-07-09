"use client";

import { useState, useMemo, useEffect, useCallback, useRef, type RefObject } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLanguage } from "@/lib/use-language";
import { t, tFmt, type Language } from "@/lib/i18n";
import { statusRawLabel, PHASE_COLOR, rankIncidents, dedupeByLocation, SEVERITY_RANK, STATUS_RANK, mapStatusGroup } from "@/lib/incident";
import { DashStat, ResourceStat } from "@/components/dashboard/stat-card";
import { HeroCounter } from "@/components/dashboard/hero-counter";
import { OperationalPhases } from "@/components/dashboard/operational-phases";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { SituationPanel } from "@/components/shell/situation-panel";
import { IncidentDetailPanel, NotificationsDrawer } from "@/components/detail/IncidentDetailPanel";
import { CollapsibleLegend } from "@/components/overlays/legend";
import { FiltersPanel } from "@/components/filters/filters-panel";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { EmberIcon, EmberFlameIcon } from "@/components/icons/brand-icons";
import { MobileView, type MobileTab } from "@/components/mobile/mobile-view";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { LongPressActions } from "@/components/mobile/long-press-actions";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { SectionError } from "@/components/ui/section-error";
import { EmptyState } from "@/components/ui/empty-state";
import { OverlayDialog } from "@/components/ui/overlay-dialog";
import type { FilterStatusItem } from "@/components/filters/filter-status";
import { useUIStore } from "@/store/ui-store";
import { buildActiveFilters, filterIncidents, isSelectableIncident, type IncidentFilterState } from "@/lib/incident-filters";
import { buildReportPayload } from "@/lib/public-actions";
import {
  Flame,
  Bell,
  Search,
  Filter,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  TrendingUp,
  Users,
  Plane,
  Trees,
  Truck,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Bookmark,
  ChevronDown,
  Satellite,
  Newspaper,
  Zap,
  Layers,
  Languages,
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
  Building2,
  Plus,
  Minus,
  Locate,
  Maximize2,
  X as XIcon,
  Navigation,
  List,
  History as HistoryIcon,
  Bell as BellIcon,
  Activity,
  Share2,
  ExternalLink,
} from "@/components/icons/phosphor-icons";
import { type BasemapMode, type FireRiskFeature, type FireStationFeature, type EmberMapHandle } from "@/components/ember-map";
import { MapScene } from "@/components/map/map-scene";
import { PlaybackBar } from "@/components/playback-bar";
import dynamic from "next/dynamic";

// Lazy-loaded UI: layer panel + advanced overlays.
const AdvancedMapLayers = dynamic(() => import("@/components/advanced-layers-host"), { ssr: false });
const NewsSection = dynamic(() => import("@/components/news-section"), { ssr: false });
import {
  AnimatedButton,
  SlideIn,
  StaggerChildren,
  StaggerItem,
  Skeleton,
  ScalePresence,
  StatusDot,
} from "@/components/ember-anim";
import {
  SAMPLE_INCIDENTS,
  PLAYBACK_FRAMES,
  NOTIFICATIONS_MOCK,
  type Incident,
  type SourceType,
  type VerificationStatus,
  type IncidentStatus,
  type Severity,
  type TimelineEvent,
} from "@/lib/sample-data";
import {
  useLiveIncidentsNew,
  useFireRiskNew, useWeatherNew,
  useDashboardNew,
  useFireStationsNew, useSourceHealthNew, useMatchedIncidentNews,
  usePersistenceStatsNew, useHistoryNew,
  useWeatherWarningsNew, useSatelliteNew,
} from "@/lib/use-app-data";
import {
  useRealtimeIncidents,
  useFollowedIncidents,
  findNearestStation,
  findFireRisk,
} from "@/lib/use-live-data";
import type { SourceHealth } from "@/lib/types";

// ============================================================
// Helpers
// ============================================================

// Enrich an incident with live weather + fire risk context
function enrichIncidentWithLiveContext(
  incident: any,
  weatherData: any,
  fireRiskData: any
): any {
  if (!incident) return incident;

  // Skip enrichment for sample-data incidents (which already have weather baked in)
  if (!incident.isLive) return incident;

  const enriched = { ...incident };

  // Weather: find nearest station
  if (weatherData && weatherData.observations?.length > 0) {
    const nearest = findNearestStation(weatherData, incident.latitude, incident.longitude);
    if (nearest && nearest.distanceKm < 50) {
      const obs = nearest.station;
      enriched.windKmh = obs.windSpeedKmh;
      enriched.humidity = obs.humidity;
      enriched.temperatureC = obs.temperature;
      // Map IPMA wind direction code to compass
      const dirMap = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      enriched.windDirection = dirMap[obs.windDirectionId] || "—";
    }
  }

  // Fire risk: find nearest municipality
  if (fireRiskData && fireRiskData.records?.length > 0) {
    const risk = findFireRisk(fireRiskData, incident.latitude, incident.longitude);
    if (risk) {
      const rcmToLabel: Record<number, any> = {
        1: "reduced", 2: "moderate", 3: "high", 4: "very_high", 5: "maximum",
      };
      enriched.ipmaRisk = rcmToLabel[risk.rcm] || "reduced";
    }
  }

  return enriched;
}

function timeAgo(iso: string, lang: Language = "en"): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));
  if (diffMin < 1) return lang === "pt" ? "agora" : "just now";
  if (diffMin < 60) return lang === "pt" ? `há ${diffMin} min` : `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return lang === "pt" ? `há ${diffHr} h` : `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return lang === "pt" ? `há ${diffDay} d` : `${diffDay}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// All operational statuses ANEPC publishes. statusGroup (EstadoAgrupado) is
// the high-level state — we map it to a UI label here. statusRaw
// (EstadoOcorrencia) is the more granular phase text shown in detail.
const STATUS_LABEL: Record<IncidentStatus, string> = {
  detected: "Detected",
  active: "Active",
  contained: "Contained",
  resolved: "Resolved",
  monitoring: "Monitoring",
};

// Raw ANEPC operational phases — moved to src/lib/incident.ts (TASK A)
// Imported as: statusRawLabel(raw, lang), PHASE_COLOR, etc.

// Localized source labels (PT/EN) — now via i18n (epic 3 partial complete)
function sourceLabel(st: SourceType, lang: Language): string {
  return t(lang, `sourceTypes.${st}`) || st;
}

// Localized verification labels (PT/EN) — now via i18n (epic 3 partial complete)
function verificationLabel(v: VerificationStatus, lang: Language): string {
  return t(lang, `trust.${v}`) || v;
}

const SOURCE_ICON: Record<SourceType, typeof Satellite> = {
  satellite: Satellite,
  official: ShieldCheck,
  community: Users,
  news: Newspaper,
  weather: Wind,
};

// ============================================================
// Main page
// ============================================================

export default function Home() {
  const { theme, setTheme } = useTheme();
  const { language: lang, changeLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);

  // === Live data hooks ===
  const liveIncidents = useLiveIncidentsNew();
  const fireRisk = useFireRiskNew();
  const weather = useWeatherNew();
  // Layer visibility state — extracted to zustand (TASK D)
  const {
    showFireRisk, setShowFireRisk,
    showFireStations, setShowFireStations,
    showSatellite, setShowSatellite,
    showAerial, setShowAerial,
    showBiomass, setShowBiomass,
    showCompositeRisk, setShowCompositeRisk,
    showHistoryModal, setShowHistoryModal,
  } = useUIStore();

  // Skip link for keyboard users (a11y A-02)
  const skipLink = (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--ember-accent)] focus:text-[var(--ember-bg)] focus:rounded-md focus:shadow-lg focus:outline-none"
    >
      {t(lang, "a11y.skipToMap")}
    </a>
  );

  const fireStations = useFireStationsNew(showFireStations);

  // Long-press marker menu state (mobile)
  const [markerMenu, setMarkerMenu] = useState<{ x: number; y: number; incidentId: string } | null>(null);
  const sourceHealth = useSourceHealthNew();
  const liveTrustDataState = liveIncidents.trust.state === "fallback"
    ? "fallback"
    : liveIncidents.trust.state === "stale"
      ? "stale"
      : liveIncidents.trust.state === "empty"
        ? "empty"
        : liveIncidents.trust.state === "error"
          ? "retryable-error"
          : null;
  const sourceHealthState = liveTrustDataState
    ?? sourceHealth.data?.dataState?.state
    ?? (sourceHealth.error ? "retryable-error" : "healthy");
  const sourceHealthReason = liveIncidents.trust.reason
    ?? sourceHealth.data?.dataState?.reason
    ?? (sourceHealth.error ? (lang === "pt" ? "Não foi possível verificar as fontes." : "Source health could not be checked.") : undefined);
  const persistenceStats = usePersistenceStatsNew();
  const history = useHistoryNew(undefined, showHistoryModal);
  const dashboard = useDashboardNew();
  const weatherWarnings = useWeatherWarningsNew();

  const satellite = useSatelliteNew(showSatellite);
  const realtime = useRealtimeIncidents((newIncident) => {
    toast.success(t(lang, "toast.newIncident"), {
      description: newIncident.displayName || t(lang, "toast.newIncidentDesc"),
      duration: 6000,
    });
    liveIncidents.refetch();
  });

  // UI state — extracted to zustand store (TASK D)
  const {
    selectedIncidentId, setSelectedIncidentId,
    flyToIncidentId, setFlyToIncidentId,
    searchQuery, setSearchQuery,
    visibleSources, toggleSource,
    severityFilter, toggleSeverity, resetSeverityFilter,
    hideResolved, setHideResolved,
    sortMode, setSortMode,
    quickFilter, setQuickFilter,
    phaseFilter, setPhaseFilter,
    resourceFilter, setResourceFilter,
    basemap, setBasemap,
    fireRiskFilter, setFireRiskFilter,
    playbackHour, setPlaybackHour,
    isPlaying, setIsPlaying,
    notifOpen, setNotifOpen,
    showReportModal, setShowReportModal,
    mobileTab, setMobileTab,
    mobileSidebarOpen, setMobileSidebarOpen,
    resetIncidentFilters, reconcileIncidentSelection,
    showShortcuts, setShowShortcuts,
    overlayStack, closeTopOverlay,
  } = useUIStore();

  // Legacy aliases for the toggle/setter naming convention
  const setVisibleSources = useUIStore((s) => s.toggleSource ? s.toggleSource : () => {});
  // (setVisibleSources kept for backward-compat — codebase uses toggleSource)

  const mapRef = useRef<EmberMapHandle>(null);

  // Notifications (local, kept for now)
  const [notifications, setNotifications] = useState(NOTIFICATIONS_MOCK);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Follow state — persisted to Prisma via /api/follow
  const { followedIds: followedIncidents, toggleFollow: toggleFollowPersisted } = useFollowedIncidents();

  // Auto-select guard — prevents re-opening panel after user closes it
  const [hasAutoSelected, setHasAutoSelected] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Read incident ID from URL query param on initial load (for share links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const incidentParam = params.get("incident");
    if (incidentParam) {
      setSelectedIncidentId(incidentParam);
      setHasAutoSelected(true); // Skip auto-select since we have a URL param
    }
  }, []);

  // Default view is the Situational Awareness dashboard with the left
  // sidebar. We do NOT auto-select a fire-location panel on initial
  // load — that hid the full map and made the user feel locked in.
  // Selection now happens only when the user clicks a marker / row.
  // The legacy hasAutoSelected flag is kept so the existing share-link
  // behaviour (URL ?incident=…) still works.

  // ---------------------------------------------------------
  // Compute visible incidents based on playback + filters
  // ---------------------------------------------------------
  const incidentFilters = useMemo<IncidentFilterState>(() => ({
    severities: severityFilter,
    hideResolved,
    quick: quickFilter,
    phase: phaseFilter,
    resource: resourceFilter,
    search: searchQuery,
  }), [severityFilter, hideResolved, quickFilter, phaseFilter, resourceFilter, searchQuery]);

  const visibleIncidents = useMemo(() => {
    // When in playback mode (T-N hours), filter live incidents by time
    // Show incidents that were first detected before the playback timestamp
    if (playbackHour < 0 && liveIncidents.incidents.length > 0) {
      const playbackTime = Date.now() + playbackHour * 3600000;
      const pool = liveIncidents.incidents.filter((inc) => {
        const detected = new Date(inc.firstDetected || inc.observedAt).getTime();
        return detected <= playbackTime;
      });
      return filterIncidents(pool, incidentFilters);
    }

    // If no live data, use sample data for playback
    if (playbackHour < 0 && liveIncidents.incidents.length === 0) {
      const frame = PLAYBACK_FRAMES.reduce((closest, f) =>
        Math.abs(f.hourOffset - playbackHour) <
        Math.abs(closest.hourOffset - playbackHour)
          ? f
          : closest
      );
      const pool = SAMPLE_INCIDENTS.filter((inc) =>
        frame.activeIncidentIds.includes(inc.id)
      );
      return filterIncidents(pool, incidentFilters);
    }

    return filterIncidents(liveIncidents.incidents, incidentFilters);
  }, [playbackHour, incidentFilters, liveIncidents.incidents]);

  const visibleIncidentIds = useMemo(
    () => new Set(visibleIncidents.map((incident) => incident.id)),
    [visibleIncidents],
  );

  useEffect(() => {
    reconcileIncidentSelection(visibleIncidentIds);
  }, [visibleIncidentIds, reconcileIncidentSelection]);

  // Build GeoJSON features for the fire risk layer (filtered by fireRiskFilter)
  const fireRiskFeatures: FireRiskFeature[] = useMemo(() => {
    if (!fireRisk.data?.records) return [];
    return fireRisk.data.records
      .filter((r) => fireRiskFilter === null || r.rcm === fireRiskFilter)
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: { rcm: r.rcm, dico: r.dico },
      }));
  }, [fireRisk.data, fireRiskFilter]);

  // Build GeoJSON features for fire stations
  const fireStationsFeatures: FireStationFeature[] = useMemo(() => {
    if (!fireStations.data?.stations) return [];
    return fireStations.data.stations.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { name: s.name, id: s.id },
    }));
  }, [fireStations.data]);

  // Build GeoJSON features for NASA FIRMS satellite detections
  const satelliteFeatures = useMemo(() => {
    if (!satellite.data?.detections) return [];
    return satellite.data.detections.map((d) => ({
      type: "Feature" as const,
      geometry: d.geometry,
      properties: {
        id: d.id,
        frp: d.properties.frp,
        confidence: d.properties.confidence,
        brightness: d.properties.brightness,
        satellite: d.properties.satellite,
        instrument: d.properties.instrument,
        observedAt: d.observedAt,
      },
    }));
  }, [satellite.data]);

  const selectedIncident = useMemo(
    () => {
      if (!selectedIncidentId) return null;
      return visibleIncidents.find((incident) => incident.id === selectedIncidentId) ?? null;
    },
    [selectedIncidentId, visibleIncidents]
  );

  // ---------------------------------------------------------
  // Severity rank for sorting (used by dashboard fallback)
  // ---------------------------------------------------------
  const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  // ---------------------------------------------------------
  // Dashboard metrics — prefer server-aggregated /api/dashboard
  // Fall back to client-side compute if dashboard endpoint hasn't loaded
  // ---------------------------------------------------------
  const dashboardMetrics = useMemo(() => {
    if (dashboard.data?.summary) {
      return {
        ...dashboard.data.summary,
        byType: dashboard.data.distribution.byType,
        byStatusGroup: dashboard.data.distribution.byStatusGroup ?? {},
      };
    }
    // Client-side fallback (used while dashboard loads)
    const all = liveIncidents.incidents;
    const active = all.filter((i) => i.status === "active" || i.status === "detected");
    const critical = all.filter((i) => i.severity === "critical");
    const high = all.filter((i) => i.severity === "high");
    const personnel = all.reduce((s, i) => s + (i.personnel || 0), 0);
    const aircraft = all.reduce((s, i) => s + (i.aircraft || 0), 0);
    const engines = all.reduce((s, i) => s + (i.engines || 0), 0);
    const areaHa = all.reduce((s, i) => s + (i.estimatedAreaHa || 0), 0);
    const byType: Record<string, number> = {};
    const byStatusGroup: Record<string, number> = {};
    for (const i of all) {
      const t = i.properties?.naturezaText || i.properties?.rasi || "other";
      byType[t] = (byType[t] || 0) + 1;
      const sg = i.properties?.statusGroup || i.properties?.statusText || i.status || "other";
      byStatusGroup[sg] = (byStatusGroup[sg] || 0) + 1;
    }
    return {
      total: all.length,
      activeCount: active.length,
      criticalCount: critical.length,
      highCount: high.length,
      personnel,
      aircraft,
      engines,
      areaHa,
      byType,
      byStatusGroup,
    };
  }, [dashboard.data, liveIncidents.incidents]);

  // Top critical incidents — prefer server, fall back to client
  const topCriticalIncidents = useMemo(() => {
    if (dashboard.data?.topPriority && dashboard.data.topPriority.length > 0) {
      return dashboard.data.topPriority;
    }
    // Fallback: rank live incidents if dashboard hasn't loaded
    const all = liveIncidents.incidents;
    return rankIncidents(all).slice(0, 20);
  }, [dashboard.data, liveIncidents.incidents]);

  // ---------------------------------------------------------
  // IPMA fire risk + weather summaries for sidebar
  // ---------------------------------------------------------
  const fireRiskDistribution = useMemo(() => {
    return fireRisk.data?.distribution ?? null;
  }, [fireRisk.data]);

  // IPMA weather summary for sidebar (avg temp, avg humidity, max wind)
  const weatherSummary = useMemo(() => {
    const obs = (weather.data?.observations ?? []).filter(
      (o: any) => o.temperature != null && o.humidity != null && o.windSpeedKmh != null
    );
    if (obs.length === 0) return null;
    const avgTemp = obs.reduce((s, o) => s + (o.temperature || 0), 0) / obs.length;
    const avgHumidity = obs.reduce((s, o) => s + (o.humidity || 0), 0) / obs.length;
    const maxWind = Math.max(...obs.map((o) => o.windSpeedKmh || 0));
    return {
      avgTemp,
      avgHumidity,
      maxWind,
      stationCount: obs.length,
    };
  }, [weather.data]);

  // ---------------------------------------------------------
  // Auto-play loop
  // ---------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setPlaybackHour((h) => {
        const next = h + 1;
        if (next >= 0) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ---------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------
  const handleSelectIncident = useCallback((id: string | null) => {
    if (!isSelectableIncident(visibleIncidentIds, id)) {
      setSelectedIncidentId(null);
      setFlyToIncidentId(null);
      return;
    }
    setSelectedIncidentId(id);
  }, [visibleIncidentIds]);

  // When the user clicks a marker ON THE MAP, fly to it.
  // Sidebar/notification selections use handleSelectIncident (no fly).
  const handleSelectIncidentFromMap = useCallback((id: string | null) => {
    if (!isSelectableIncident(visibleIncidentIds, id)) {
      setSelectedIncidentId(null);
      setFlyToIncidentId(null);
      return;
    }
    setSelectedIncidentId(id);
    if (id) setFlyToIncidentId(id);
  }, [visibleIncidentIds]);

  // Toast-powered actions
  const handleRefresh = useCallback(() => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 600)),
      {
        loading: t(lang, "toast.refreshing"),
        success: t(lang, "toast.refreshed"),
        error: t(lang, "toast.refreshFailed"),
      }
    );
    liveIncidents.refetch();
  }, [liveIncidents, lang]);

  const handleLocate = useCallback(() => {
    if (selectedIncidentId) {
      setFlyToIncidentId(selectedIncidentId);
      const inc = liveIncidents.incidents.find((i: any) => i.id === selectedIncidentId);
      if (inc) {
        toast.success(`Centered on ${inc.displayName}`, {
          description: `${inc.municipality || ""} · zoomed to incident`,
        });
      }
    }
  }, [selectedIncidentId, liveIncidents.incidents]);

  const handleResetView = useCallback(() => {
    mapRef.current?.resetView();
    toast(t(lang, "toast.resetView"), { description: t(lang, "toast.showingAll") });
  }, [lang]);

  const handleToggleFollow = useCallback(async (id: string) => {
    const wasFollowing = followedIncidents.has(id);
    const incident = liveIncidents.incidents.find((i: any) => i.id === id);
    const name = incident?.displayName || "incident";
    try {
      await toggleFollowPersisted(id);
      if (wasFollowing) {
        toast(t(lang, "toast.unfollowed"), { description: name });
      } else {
        toast.success(t(lang, "toast.followed"), {
          description: lang === "pt" ? `${name} — receberá atualizações` : `${name} — you'll get updates`,
        });
      }
    } catch {
      toast.error(lang === "pt" ? "Não foi possível atualizar o alerta." : "Unable to update the alert.");
    }
  }, [followedIncidents, liveIncidents.incidents, toggleFollowPersisted]);

  // Toast on live data status change
  const prevFallbackRef = useRef(false);
  useEffect(() => {
    if (liveIncidents.usingFallback && !prevFallbackRef.current) {
      toast.error(t(lang, "toast.liveUnavailable"), {
        description: t(lang, "toast.fallbackDesc"),
      });
    }
    if (!liveIncidents.usingFallback && prevFallbackRef.current && liveIncidents.liveCount > 0) {
      toast.success(t(lang, "toast.liveRestored"), {
        description: lang === "pt"
          ? `${liveIncidents.liveCount} incidentes da ANEPC`
          : `${liveIncidents.liveCount} incidents from ANEPC`,
      });
    }
    prevFallbackRef.current = liveIncidents.usingFallback;
  }, [liveIncidents.usingFallback, liveIncidents.liveCount, lang]);

  const toggleFollow = (id: string) => {
    handleToggleFollow(id);
  };

  const markAllNotifsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // ============================================================
  // Keyboard shortcuts
  // ============================================================
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Allow Escape to blur the input
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

      if (e.key === "Escape") {
        if (closeTopOverlay()) return;
        if (selectedIncidentId) {
          setSelectedIncidentId(null);
        }
      } else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "r" || e.key === "R") {
        handleRefresh();
      } else if (e.key === "f" || e.key === "F") {
        if (selectedIncidentId) {
          handleToggleFollow(selectedIncidentId);
        }
      } else if (e.key === "l" || e.key === "L") {
        if (selectedIncidentId) {
          setFlyToIncidentId(selectedIncidentId);
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts(!showShortcuts);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overlayStack, selectedIncidentId, closeTopOverlay, handleRefresh, handleToggleFollow, showShortcuts, setShowShortcuts]);

  // ============================================================
  // Render
  // ============================================================

  // Query reset intentionally preserves display-only map layers.
  const resetAllFilters = () => resetIncidentFilters();

  // Active filter items — single source of truth shared between
  // the right Filters panel (active filter chips) and the left dashboard
  // (filter status banner with clear button).
  const activeFilterItems: FilterStatusItem[] = useMemo(() => buildActiveFilters(
    incidentFilters,
    {
      resetSeverities: resetSeverityFilter,
      setHideResolved,
      setQuick: setQuickFilter,
      setPhase: setPhaseFilter,
      setResource: setResourceFilter,
      setSearch: setSearchQuery,
    },
  ).map((filter) => ({
    id: filter.id,
    onClear: filter.clear,
    label: filter.id === "quick"
      ? (quickFilter === "active" ? t(lang, "dashboard.active") : quickFilter === "critical" ? t(lang, "dashboard.critical") : t(lang, "dashboard.high"))
      : filter.id === "severity"
        ? (Array.from(severityFilter).map((severity) => t(lang, `severity.${severity}`)).join(", ") || t(lang, "error.noResults"))
        : filter.id === "resolved"
          ? (lang === "pt" ? "Incluir resolvidos" : "Including resolved")
          : filter.id === "search"
            ? `"${searchQuery}"`
            : filter.id === "resource"
              ? (resourceFilter === "personnel" ? (lang === "pt" ? "Com pessoal" : "With personnel") : resourceFilter === "engines" ? (lang === "pt" ? "Com veículos" : "With engines") : (lang === "pt" ? "Com aeronaves" : "With aircraft"))
              : filter.id === "phase"
                ? phaseFilter ?? ""
                : filter.label,
  })), [
    incidentFilters,
    resetSeverityFilter,
    setHideResolved,
    setQuickFilter,
    setPhaseFilter,
    setResourceFilter,
    setSearchQuery,
    quickFilter,
    severityFilter,
    resourceFilter,
    phaseFilter,
    searchQuery,
    lang,
  ]);
  const activeFilterCount = activeFilterItems.length;

  return (
    <div className="h-screen w-full flex xl:overflow-hidden overflow-hidden flex-col xl:flex-row bg-[var(--ember-bg)] text-[var(--ember-text)] font-sans relative">
      {skipLink}

      {/* ===== MOBILE INCIDENT DETAIL (bottom sheet with drag-to-dismiss) ===== */}
      <BottomSheet
        open={!!selectedIncident}
        onClose={() => setSelectedIncidentId(null)}
        ariaLabel={lang === "pt" ? "Detalhes do incêndio" : "Incident details"}
        snapVh={92}
        zIndex={40}
        header={
          <div className="flex-shrink-0 px-4 pt-2 pb-2 flex items-center justify-between border-b border-[var(--ember-border)] relative">
            <div className="w-12 h-1.5 rounded-full bg-[var(--ember-border-strong)] mx-auto absolute left-1/2 -translate-x-1/2 top-1.5" />
            <div className="flex-1" />
            <button
              onClick={() => setSelectedIncidentId(null)}
              className="ml-auto w-10 h-10 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
              aria-label={t(lang, "a11y.closePanel")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        }
      >
        {selectedIncident && (
          <IncidentDetailPanel
            key={selectedIncident.id}
            incident={enrichIncidentWithLiveContext(selectedIncident, weather.data, fireRisk.data)}
            onClose={() => setSelectedIncidentId(null)}
            isFollowed={followedIncidents.has(selectedIncident.id)}
            onToggleFollow={() => toggleFollow(selectedIncident.id)}
            lang={lang}
            isMobile
            sourceHealthState={sourceHealthState}
            sourceHealthReason={sourceHealthReason}
          />
        )}
      </BottomSheet>

      {/* ===== LEFT: SITUATION (awareness only; query controls live in Explore) ===== */}
      <div className="hidden xl:flex h-full flex-shrink-0 w-[360px] border-r border-[var(--ember-border)] flex-col">
        <SituationPanel
          lang={lang}
          incidentCount={visibleIncidents.length}
          criticalCount={visibleIncidents.filter((incident) => incident.severity === "critical").length}
          priorityIncidents={topCriticalIncidents as any}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={handleSelectIncidentFromMap}
          onOpenAllIncidents={() => setQuickFilter("all")}
          trustState={sourceHealthState}
          trustReason={sourceHealthReason}
          updatedAt={liveIncidents.trust.sourceUpdatedAt ?? liveIncidents.refetchedAt}
        />
      </div>

      {/* ===== CENTER: MAP (desktop only — mobile uses MobileView's Map tab) ===== */}
      <main id="main-content" className="absolute inset-0 z-0 flex flex-col min-w-0 xl:static xl:relative xl:flex-1">
        {/* Top app bar — map controls only (brand is in dashboard panel header) */}
        <header className="hidden xl:flex sticky md:absolute top-0 left-0 right-0 z-30 justify-end items-center h-14 lg:h-16 px-3 lg:px-6 pointer-events-none select-none bg-transparent">
          <div className="flex items-center gap-1.5 md:gap-2 pointer-events-auto">
            {/* Notifications */}
            <button
              onClick={() => setNotifOpen(true)}
              className="relative h-9 w-9 rounded-md flex items-center justify-center bg-[var(--ember-surface)]/80 backdrop-blur border border-[var(--ember-border)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/50"
              aria-label={unreadCount > 0
                ? tFmt(lang, "header.notificationsWithUnread", { count: unreadCount })
                : t(lang, "header.notifications")}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--ember-critical)] text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
                  aria-hidden="true"
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Keyboard shortcuts help */}
            <button
              onClick={() => setShowShortcuts(true)}
              className="h-9 w-9 rounded-md flex items-center justify-center bg-[var(--ember-surface)]/80 backdrop-blur border border-[var(--ember-border)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/50"
              aria-label="Keyboard shortcuts"
              aria-expanded={showShortcuts}
              aria-haspopup="dialog"
              title="Keyboard shortcuts (?)"
            >
              <kbd className="text-xs font-mono">?</kbd>
            </button>

            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-9 w-9 rounded-md flex items-center justify-center bg-[var(--ember-surface)]/80 backdrop-blur border border-[var(--ember-border)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Language toggle — PT (primary) / EN (secondary) */}
            {mounted && (
              <button
                onClick={() => changeLanguage(lang === "pt" ? "en" : "pt")}
                className="h-9 pl-2 pr-1 rounded-md flex items-center gap-1 bg-[var(--ember-surface)]/80 backdrop-blur border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] transition-all text-[11px] font-mono font-bold uppercase"
                aria-label="Toggle language"
                title={lang === "pt" ? t(lang, "header.switchToEnglish") : t(lang, "header.switchToPortuguese")}
              >
                <Languages className="w-3.5 h-3.5 text-[var(--ember-text-muted)]" />
                <span
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    lang === "pt"
                      ? "bg-[var(--ember-accent)] text-[var(--ember-bg)]"
                      : "text-[var(--ember-text-faint)]"
                  }`}
                >
                  PT
                </span>
                <span className="text-[var(--ember-text-faint)]">/</span>
                <span
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    lang === "en"
                      ? "bg-[var(--ember-accent)] text-[var(--ember-bg)]"
                      : "text-[var(--ember-text-faint)]"
                  }`}
                >
                  EN
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Map */}
        <div className="flex-1 relative w-full h-full">
          {mounted && (
            <MapScene
              mapRef={mapRef}
              incidents={visibleIncidents as any[]}
              selectedIncidentId={selectedIncidentId}
              theme={(theme as "dark" | "light") || "dark"}
              basemap={basemap}
              visibleSources={visibleSources as any}
              onSelectIncident={handleSelectIncidentFromMap}
              onMarkerLongPress={(x, y, id) => setMarkerMenu({ x, y, incidentId: id })}
              flyToIncidentId={flyToIncidentId}
              onFlyToCleared={() => setFlyToIncidentId(null)}
              fireRiskFeatures={fireRiskFeatures}
              fireStationsFeatures={fireStationsFeatures}
              satelliteFeatures={satelliteFeatures}
              showFireRisk={showFireRisk}
              showFireStations={showFireStations}
              showSatellite={showSatellite}
            />
          )}

          {/* Map controls — right side */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="hidden xl:flex absolute top-20 right-3 lg:right-6 z-10 flex-col gap-1.5 pointer-events-auto"
          >
            <AnimatedButton
              variant="default"
              size="icon"
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
              title="Zoom in"
              className="shadow-[var(--ember-shadow-sm)] bg-[var(--ember-surface)]/90 backdrop-blur"
            >
              <Plus className="w-4 h-4" />
            </AnimatedButton>
            <AnimatedButton
              variant="default"
              size="icon"
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
              title="Zoom out"
              className="shadow-[var(--ember-shadow-sm)] bg-[var(--ember-surface)]/90 backdrop-blur"
            >
              <Minus className="w-4 h-4" />
            </AnimatedButton>
            <div className="h-px my-0.5 bg-[var(--ember-border)]" />
            <AnimatePresence>
              {selectedIncidentId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <AnimatedButton
                    variant="accent"
                    size="icon"
                    onClick={handleLocate}
                    aria-label="Locate selected incident"
                    title="Center map on selected incident"
                    className="shadow-[var(--ember-shadow-sm)] ember-glow-critical"
                  >
                    <Locate className="w-4 h-4" />
                  </AnimatedButton>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatedButton
              variant="default"
              size="icon"
              onClick={handleResetView}
              aria-label="Reset view to Portugal"
              title="Reset view to Portugal"
              className="shadow-[var(--ember-shadow-sm)] bg-[var(--ember-surface)]/90 backdrop-blur"
            >
              <Maximize2 className="w-4 h-4" />
            </AnimatedButton>
          </motion.div>

          {/* Map attribution overlay (citizen-facing) */}
          <div className="hidden xl:flex absolute top-20 left-3 lg:left-6 z-10 items-center gap-2 pointer-events-auto">
            <div className="bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border-strong)] rounded-md px-3 py-1.5 text-xs text-[var(--ember-text)] shadow-[var(--ember-shadow-sm)] flex items-center gap-1.5 font-medium">
              <Flame className="w-3 h-3 text-[var(--ember-critical)] flex-shrink-0" />
              <span className="font-mono font-bold text-[var(--ember-text)]">
                {visibleIncidents.length}
              </span>
              <span className="text-[var(--ember-text-muted)]">{t(lang, "map.incidentsVisible")}</span>
              <span className={`border-l border-[var(--ember-border)] pl-1.5 text-[10px] ${liveIncidents.trust.state === "fresh" ? "text-[var(--ember-text-faint)]" : "text-[var(--ember-warning)]"}`} title={liveIncidents.trust.reason ?? undefined}>
                {liveIncidents.trust.state === "fallback"
                  ? (lang === "pt" ? "dados alternativos" : "fallback data")
                  : liveIncidents.trust.state === "stale"
                    ? (lang === "pt" ? "dados desatualizados" : "stale data")
                    : liveIncidents.trust.state === "error"
                      ? (lang === "pt" ? "a tentar atualizar" : "retrying")
                      : liveIncidents.refetchedAt
                        ? `${lang === "pt" ? "atualizado" : "updated"} ${timeAgo(typeof liveIncidents.refetchedAt === "string" ? liveIncidents.refetchedAt : liveIncidents.refetchedAt.toISOString(), lang)}`
                        : (lang === "pt" ? "a atualizar" : "updating")}
              </span>
              {playbackHour < 0 && (
                <span className="text-[var(--ember-text-faint)] ml-1 font-mono">
                  · T{playbackHour}h
                </span>
              )}
            </div>
          </div>

          {/* Advanced map layers — toggled from sidebar MAP LAYERS section */}
          <AdvancedMapLayers flags={{ biomass: showBiomass, risk: showCompositeRisk, aerial: showAerial }} />

          {/* Legend — collapsible (desktop) + compact (mobile) */}
          <div className="hidden xl:block">
            <CollapsibleLegend lang={lang} />
          </div>
        </div>

        {/* Playback timeline — collapsed by default, expanded when active */}
        <div className="hidden xl:block">
          <PlaybackBar
            hour={playbackHour}
            isPlaying={isPlaying}
            onSeek={setPlaybackHour}
            onTogglePlay={() => {
              if (playbackHour === 0) setPlaybackHour(-24);
              setIsPlaying((p) => !p);
            }}
            onSkipBack={() => setPlaybackHour((h) => Math.max(-24, h - 2))}
            onSkipForward={() => setPlaybackHour((h) => Math.min(0, h + 2))}
            lang={lang}
          />
        </div>
      </main>

      {/* ===== RIGHT: COLLAPSIBLE RAIL (Filters + Detail + News panels) ===== */}
      <RightSidebar
        selectedIncidentId={selectedIncidentId}
        onCloseDetail={() => setSelectedIncidentId(null)}
        activeFilterCount={activeFilterCount}
        news={<NewsSection lang={lang} />}
        filters={
          <FiltersPanel
            lang={lang}
            variant="desktop"
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            quickFilter={quickFilter}
            setQuickFilter={setQuickFilter}
            severityFilter={severityFilter}
            toggleSeverity={toggleSeverity}
            resetSeverityFilter={resetSeverityFilter}
            hideResolved={hideResolved}
            setHideResolved={setHideResolved}
            visibleSources={visibleSources}
            toggleSource={toggleSource as any}
            showFireRisk={showFireRisk}
            setShowFireRisk={setShowFireRisk}
            showFireStations={showFireStations}
            setShowFireStations={setShowFireStations}
            showSatellite={showSatellite}
            setShowSatellite={setShowSatellite}
            showAerial={showAerial}
            setShowAerial={setShowAerial}
            showBiomass={showBiomass}
            setShowBiomass={setShowBiomass}
            showCompositeRisk={showCompositeRisk}
            setShowCompositeRisk={setShowCompositeRisk}
            basemap={basemap}
            setBasemap={setBasemap}
            fireRiskReady={!!fireRisk.data}
            fireRiskCount={fireRisk.data?.count ?? 0}
            fireStationsReady={!!fireStations.data}
            fireStationsCount={fireStations.data?.count ?? 0}
            satelliteReady={!!satellite.data}
            satelliteCount={satellite.data?.count ?? 0}
            sourceHealth={sourceHealth.data?.sources ?? []}
            liveCount={visibleIncidents.length}
            activeFilters={activeFilterItems}
          />
        }
        detail={
          selectedIncident ? (
            <IncidentDetailPanel
              key={selectedIncident.id}
              incident={enrichIncidentWithLiveContext(selectedIncident, weather.data, fireRisk.data)}
              onClose={() => setSelectedIncidentId(null)}
              isFollowed={followedIncidents.has(selectedIncident.id)}
              onToggleFollow={() => toggleFollow(selectedIncident.id)}
              lang={lang}
              hideHeader
              sourceHealthState={sourceHealthState}
              sourceHealthReason={sourceHealthReason}
            />
          ) : null
        }
      />

      {/* ===== NOTIFICATIONS DRAWER ===== */}
      <AnimatePresence>
        {notifOpen && (
          <NotificationsDrawer
            key="notif-drawer"
            notifications={notifications}
            onClose={() => setNotifOpen(false)}
            onMarkAllRead={markAllNotifsRead}
            onSelectIncident={(id) => {
              setSelectedIncidentId(id);
              setNotifOpen(false);
            }}
            lang={lang}
          />
        )}
      </AnimatePresence>

      {/* ===== MOBILE SIDEBAR DRAWER (removed — F-23: same content as desktop, horizontal scroll) ===== */}

      {/* ===== HISTORY MODAL ===== */}
      <AnimatePresence>
        {showHistoryModal && (
          <HistoryModal onClose={() => setShowHistoryModal(false)} onSelectIncident={(id) => { setSelectedIncidentId(id); setShowHistoryModal(false); }} lang={lang} />
        )}
      </AnimatePresence>

      {/* ===== REPORT FIRE MODAL (Phase 2 — Community Reports) ===== */}
      <AnimatePresence>
        {showReportModal && (
          <ReportFireModal onClose={() => setShowReportModal(false)} lang={lang} />
        )}
      </AnimatePresence>

      {/* ================================================================
         MOBILE-ONLY LAYER (hidden on md+)
         Pattern: full-screen map + bottom sheet + 4-tab bottom nav
         References: Watch Duty, Cal Fire, Google Maps, Material Design 3
         ================================================================ */}
      <div className="xl:hidden">
        <MobileView
          activeTab={mobileTab}
          onTabChange={setMobileTab}
          incidentCount={visibleIncidents.length}
          criticalCount={visibleIncidents.filter((i) => i.severity === "critical").length}
          filterCount={activeFilterCount}
          severityCounts={{
            critical: visibleIncidents.filter((i) => i.severity === "critical").length,
            high: visibleIncidents.filter((i) => i.severity === "high").length,
            medium: visibleIncidents.filter((i) => i.severity === "medium").length,
            low: visibleIncidents.filter((i) => i.severity === "low").length,
          }}
          activeSeverities={severityFilter}
          onToggleSeverity={(s) => toggleSeverity(s)}
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocate={() => mapRef.current?.resetView()}
          lang={lang}
          peekTotal={visibleIncidents.length}
          peekCritical={visibleIncidents.filter((i) => i.severity === "critical").length}
          peekHigh={visibleIncidents.filter((i) => i.severity === "high").length}
          peekIncidents={topCriticalIncidents.slice(0, 5).map((inc: any) => ({
            id: inc.id,
            displayName: inc.displayName || inc.properties?.displayName || "",
            severity: inc.severity,
            municipality: inc.municipality,
            statusGroup: inc.properties?.statusGroup,
            statusText: inc.properties?.statusText,
            personnel: inc.properties?.personnelTotal,
          }))}
          onTapIncident={handleSelectIncidentFromMap}
          lastUpdated={liveIncidents.refetchedAt || null}
          dataTrust={liveIncidents.trust}
          onRefresh={async () => {
            try {
              await Promise.all([
                liveIncidents.refetch?.(),
                dashboard.refetch?.(),
              ]);
            } catch {}
          }}
          activeFilters={activeFilterItems}
          map={null}
          dashboard={
            <DashboardPanel
              mode="full"
              metrics={dashboardMetrics}
              topIncidents={topCriticalIncidents}
              recentHistory={history.data?.incidents ?? []}
              onSelectIncident={handleSelectIncidentFromMap}
              onOpenHistory={() => setShowHistoryModal(true)}
              sourceHealth={sourceHealth.data?.sources ?? []}
              realtimeConnected={realtime.connected}
              persistenceStats={persistenceStats.data}
              usingFallback={liveIncidents.usingFallback}
              allIncidents={visibleIncidents}
              sortMode={sortMode}
              setSortMode={setSortMode}
              quickFilter={quickFilter as any}
              setQuickFilter={setQuickFilter as any}
              phaseFilter={phaseFilter}
              setPhaseFilter={setPhaseFilter}
              resourceFilter={resourceFilter}
              setResourceFilter={setResourceFilter}
              hideResolved={hideResolved}
              setHideResolved={setHideResolved}
              severityFilter={severityFilter as any}
              toggleSeverity={toggleSeverity as any}
              visibleSources={visibleSources as any}
              toggleSource={toggleSource as any}
              selectedIncidentId={selectedIncidentId}
              followedIncidentIds={followedIncidents}
              loading={dashboard.loading}
              lang={lang}
              dataFetchedAt={liveIncidents.refetchedAt}
              dashboardError={!!dashboard.error}
              onRetryDashboard={() => dashboard.refetch?.()}
            />
          }
          sidebar={
            <FiltersPanel
              lang={lang}
              variant="mobile"
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              quickFilter={quickFilter as any}
              setQuickFilter={setQuickFilter as any}
              severityFilter={severityFilter as any}
              toggleSeverity={toggleSeverity as any}
              resetSeverityFilter={resetSeverityFilter}
              hideResolved={hideResolved}
              setHideResolved={setHideResolved}
              visibleSources={visibleSources as any}
              toggleSource={toggleSource as any}
              showFireRisk={showFireRisk}
              setShowFireRisk={setShowFireRisk}
              showFireStations={showFireStations}
              setShowFireStations={setShowFireStations}
              showSatellite={showSatellite}
              setShowSatellite={setShowSatellite}
              showAerial={showAerial}
              setShowAerial={setShowAerial}
              showBiomass={showBiomass}
              setShowBiomass={setShowBiomass}
              showCompositeRisk={showCompositeRisk}
              setShowCompositeRisk={setShowCompositeRisk}
              basemap={basemap}
              setBasemap={setBasemap}
              fireRiskReady={!!fireRisk.data}
              fireRiskCount={fireRisk.data?.count ?? 0}
              fireStationsReady={!!fireStations.data}
              fireStationsCount={fireStations.data?.count ?? 0}
              satelliteReady={!!satellite.data}
              satelliteCount={satellite.data?.count ?? 0}
              sourceHealth={sourceHealth.data?.sources ?? []}
              liveCount={visibleIncidents.length}
              activeFilters={activeFilterItems}
            />
          }
          alerts={
            <div className="space-y-3 p-4">
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                aria-label={tFmt(lang, "header.notificationsWithUnread", { count: unreadCount })}
                className="min-h-11 w-full rounded-lg border border-[var(--ember-border)] bg-[var(--ember-surface-2)] px-4 py-3.5 text-left hover:border-[var(--ember-border-strong)]"
              >
                <span className="text-sm font-medium">{t(lang, "header.viewNotifications")}</span>
                <span className="mt-1 block text-[11px] text-[var(--ember-text-faint)]">{unreadCount} {t(lang, "mobile.unread")}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="min-h-11 w-full rounded-lg border border-[var(--ember-border)] bg-[var(--ember-surface-2)] px-4 py-3.5 text-left hover:border-[var(--ember-border-strong)]"
              >
                <span className="text-sm font-medium">{t(lang, "mobile.history")}</span>
                <span className="mt-1 block text-[11px] text-[var(--ember-text-faint)]">{persistenceStats.data?.total ?? 0} {t(lang, "mobile.historyDesc")}</span>
              </button>
            </div>
          }
          more={
            <div className="p-4 space-y-3">
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-[var(--ember-critical-subtle)] border border-[var(--ember-critical)]/40 hover:border-[var(--ember-critical)] text-left"
              >
                <EmberFlameIcon className="w-5 h-5 text-[var(--ember-critical)]" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--ember-critical)]">{t(lang, "mobile.reportFire")}</div>
                  <div className="text-[11px] text-[var(--ember-text-faint)]">{t(lang, "mobile.reportFireDesc")}</div>
                </div>
              </button>
              <div className="pt-2 border-t border-[var(--ember-border)] mt-4 space-y-2">
                {/* Theme toggle */}
                {mounted && (
                  <button
                    type="button"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] text-left"
                  >
                    {theme === "dark" ? <Sun className="w-5 h-5 text-[var(--ember-accent)]" /> : <Moon className="w-5 h-5 text-[var(--ember-accent)]" />}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{t(lang, "mobile.theme")}</div>
                      <div className="text-[11px] text-[var(--ember-text-faint)]">{theme === "dark" ? t(lang, "mobile.themeDark") : t(lang, "mobile.themeLight")}</div>
                    </div>
                  </button>
                )}
                {/* About */}
                <a
                  href="/status"
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] text-left"
                >
                  <Activity className="w-5 h-5 text-[var(--ember-accent)]" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t(lang, "mobile.systemStatus")}</div>
                    <div className="text-[11px] text-[var(--ember-text-faint)]">{t(lang, "mobile.systemStatusDesc")}</div>
                  </div>
                </a>
                {/* Share */}
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: "Lumes",
                        text: t(lang, "mobile.shareText"),
                        url: window.location.origin,
                      }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(window.location.origin).then(() => {
                        toast.success(t(lang, "mobile.linkCopied"));
                      }).catch(() => {});
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] text-left"
                >
                  <Share2 className="w-5 h-5 text-[var(--ember-accent)]" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{lang === "pt" ? "Partilhar Lumes" : "Share Lumes"}</div>
                    <div className="text-[11px] text-[var(--ember-text-faint)]">{t(lang, "mobile.shareDesc")}</div>
                  </div>
                </button>
                <p className="text-[10px] text-[var(--ember-text-faint)] text-center pt-2">Lumes · v0.2.0</p>
              </div>
            </div>
          }
        />
      </div>

      {/* ===== LONG-PRESS MARKER MENU (mobile) ===== */}
      {markerMenu && (() => {
        const target = liveIncidents.incidents.find((i) => i.id === markerMenu.incidentId)
          ?? liveIncidents.incidents[0];
        return (
          <LongPressActions
            x={markerMenu.x}
            y={markerMenu.y}
            onClose={() => setMarkerMenu(null)}
            isFollowed={followedIncidents.has(markerMenu.incidentId)}
            onFollow={async () => {
              await toggleFollow(markerMenu.incidentId);
            }}
            onShare={() => {
              const url = `${window.location.origin}/?incident=${encodeURIComponent(markerMenu.incidentId)}`;
              if (navigator.share) {
                navigator.share({ title: "Lumes", url }).catch(() => {});
              } else {
                navigator.clipboard.writeText(url).then(() => toast.success(lang === "pt" ? "Link copiado" : "Link copied")).catch(() => {});
              }
            }}
            onLocate={() => {
              setFlyToIncidentId(markerMenu.incidentId);
              setMarkerMenu(null);
            }}
            onAlert={() => {
              // Set an alert by following + notifying — for now reuse follow
              toggleFollow(markerMenu.incidentId);
            }}
            onOpenDetail={() => {
              setSelectedIncidentId(markerMenu.incidentId);
              setFlyToIncidentId(markerMenu.incidentId);
              setMarkerMenu(null);
            }}
          />
        );
      })()}

      {/* ===== KEYBOARD SHORTCUTS OVERLAY ===== */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-xl shadow-[var(--ember-shadow-lg)] p-6 w-[400px] max-w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[var(--ember-text)]">{t(lang, "shortcuts.title")}</h2>
                <button
                  onClick={() => setShowShortcuts(false)}
                  className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
                  aria-label={t(lang, "a11y.closeShortcuts")}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2.5">
                {[
                  { key: "/", desc: "Focus search" },
                  { key: "R", desc: "Refresh incidents" },
                  { key: "F", desc: "Follow / unfollow incident" },
                  { key: "L", desc: "Locate selected incident on map" },
                  { key: "Esc", desc: "Close panel / drawer / overlay" },
                  { key: "?", desc: "Toggle this help" },
                ].map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--ember-text-muted)]">{s.desc}</span>
                    <kbd className="px-2 py-0.5 rounded border border-[var(--ember-border)] bg-[var(--ember-surface-2)] text-xs font-mono text-[var(--ember-text)] min-w-8 text-center">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Sidebar
// ============================================================

// ============================================================
// Report Fire Modal — Phase 2 Community Reports
// ============================================================
function ReportFireModal({ onClose, lang }: { onClose: () => void; lang: Language }) {
  const [reportType, setReportType] = useState<"smoke" | "flame" | "road_closure" | "evacuation" | "contained">("smoke");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const reportTypes = [
    { value: "smoke", label: t(lang, "report.smoke"), icon: Wind, color: "var(--ember-warning)" },
    { value: "flame", label: t(lang, "report.flame"), icon: Flame, color: "var(--ember-critical)" },
    { value: "road_closure", label: t(lang, "report.roadClosure"), icon: AlertTriangle, color: "var(--ember-info)" },
    { value: "evacuation", label: t(lang, "report.evacuation"), icon: Users, color: "var(--ember-critical)" },
    { value: "contained", label: t(lang, "report.contained"), icon: CheckCircle2, color: "var(--ember-success)" },
  ] as const;

  const handleGetLocation = () => {
    setLocating(true);
    if (!navigator.geolocation) {
      toast.error(t(lang, "report.geoNotSupported"));
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
        toast.success(t(lang, "report.locationCaptured"));
      },
      (err) => {
        // Translate common geolocation errors
        const errKey: Record<number, string> = {
          1: "report.geoPermissionDenied",
          2: "report.geoPositionUnavailable",
          3: "report.geoTimeout",
        };
        const msg = errKey[err.code] ? t(lang, errKey[err.code]) : err.message;
        toast.error(t(lang, "report.geoFailed") + ": " + msg);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async () => {
    if (!location) {
      toast.error(t(lang, "report.captureLocationFirst"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReportPayload({
          reportType,
          latitude: location.lat,
          longitude: location.lon,
          description,
          reporterName,
        })),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(t(lang, "toast.reportSubmitted"), {
          description: t(lang, "toast.reportDesc"),
          duration: 6000,
        });
        onClose();
      } else {
        toast.error(t(lang, "report.submissionFailed"), { description: data.error });
      }
    } catch (err) {
      toast.error(t(lang, "toast.reportFailed"));
    }
    setSubmitting(false);
  };

  return (
    <OverlayDialog
      ariaLabel={t(lang, "report.title")}
      onClose={onClose}
      panelClassName="w-full max-w-[440px] max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ember-border)] ember-scroll"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ember-border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[var(--ember-critical)] flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--ember-text)]">{t(lang, "report.title")}</h2>
              <p className="text-[10px] text-[var(--ember-text-faint)]">{t(lang, "report.subtitle")}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors" aria-label={t(lang, "a11y.closePanel")}>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Emergency notice */}
          <div className="px-3 py-2 rounded-md bg-[var(--ember-critical-subtle)] border border-[var(--ember-critical)]/30 text-xs text-[var(--ember-critical)] flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{t(lang, "report.emergency")}.</span> {t(lang, "report.emergencyDesc")}
            </div>
          </div>

          {/* Report type */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.reportType")}</label>
            <div className="grid grid-cols-1 gap-1.5">
              {reportTypes.map((rt) => (
                <motion.button
                  key={rt.value}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setReportType(rt.value)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
                    reportType === rt.value
                      ? "bg-[var(--ember-surface-2)] border-[var(--ember-border-strong)]"
                      : "border-[var(--ember-border)] hover:bg-[var(--ember-surface-2)]"
                  }`}
                >
                  <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: reportType === rt.value ? rt.color : "var(--ember-surface-2)", color: reportType === rt.value ? "white" : "var(--ember-text-muted)" }}>
                    <rt.icon className="w-3.5 h-3.5" />
                  </span>
                  <span className={`text-sm ${reportType === rt.value ? "text-[var(--ember-text)] font-medium" : "text-[var(--ember-text-muted)]"}`}>{rt.label}</span>
                  {reportType === rt.value && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: rt.color }} />}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.location")}</label>
            {location ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--ember-accent)]" />
                  <span className="text-sm font-mono text-[var(--ember-text)]">{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
                </div>
                <button onClick={handleGetLocation} className="text-xs text-[var(--ember-accent)] hover:underline">{t(lang, "report.update")}</button>
              </div>
            ) : (
              <AnimatedButton variant="default" className="w-full" onClick={handleGetLocation} loading={locating}>
                <MapPin className="w-3.5 h-3.5" />
                {locating ? t(lang, "report.gettingLocation") : t(lang, "report.captureLocation")}
              </AnimatedButton>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="report-description" className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.description")}</label>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(lang, "report.descriptionPlaceholder")}
              rows={3}
              aria-describedby="report-description-help"
              className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md px-3 py-2 text-sm text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/20 transition-all resize-none"
            />
            <span id="report-description-help" className="sr-only">
              Optional description for the fire report
            </span>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="report-name" className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.yourName")}</label>
            <input
              id="report-name"
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder={t(lang, "report.anonymous")}
              autoComplete="name"
              className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md px-3 py-2 text-sm text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none transition-colors h-9"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--ember-border)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--ember-text-faint)]">
            {t(lang, "report.moderationNote")}
          </span>
          <div className="flex gap-2">
            <AnimatedButton variant="ghost" size="sm" onClick={onClose}>{t(lang, "report.cancel")}</AnimatedButton>
            <AnimatedButton variant="critical" size="sm" onClick={handleSubmit} loading={submitting} disabled={!location}>
              {t(lang, "report.submit")}
            </AnimatedButton>
          </div>
        </div>
    </OverlayDialog>
  );
}

// ============================================================
// History Modal — full incident history with date filter
// ============================================================
function HistoryModal({ onClose, onSelectIncident, lang }: { onClose: () => void; onSelectIncident: (id: string) => void; lang: Language }) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/history?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setIncidents(data.incidents || []);
          setTotal(data.total || 0);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return incidents;
    const q = searchTerm.toLowerCase();
    return incidents.filter((inc) =>
      inc.displayName?.toLowerCase().includes(q) ||
      inc.municipality?.toLowerCase().includes(q) ||
      inc.district?.toLowerCase().includes(q)
    );
  }, [incidents, searchTerm]);

  return (
    <OverlayDialog
      ariaLabel={t(lang, "history.title")}
      onClose={onClose}
      panelClassName="w-full max-w-[600px] max-h-[80vh] rounded-xl border border-[var(--ember-border)]"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ember-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[var(--ember-accent-subtle)] flex items-center justify-center">
              <Clock className="w-4 h-4 text-[var(--ember-accent)]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--ember-text)]">{t(lang, "history.title")}</h2>
              <p className="text-[10px] text-[var(--ember-text-faint)]">
                {total} {t(lang, "history.subtitle")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors" aria-label={t(lang, "a11y.closeHistory")}>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
          <div className="flex gap-1.5">
            {["all", "active", "contained", "resolved"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] border border-[var(--ember-accent)]/30"
                    : "bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] border border-transparent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ember-text-faint)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, municipality..."
              className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md pl-8 pr-3 py-1.5 text-xs text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none h-8"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto ember-scroll p-3">
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton width={10} height={10} className="rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton width="50%" height={10} />
                    <Skeleton width="30%" height={8} />
                  </div>
                  <Skeleton width={40} height={8} />
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="px-4 py-4">
              <EmptyState
                variant="no-results"
                lang={lang}
                compact
                action={{
                  label: lang === "pt" ? "Limpar filtros" : "Clear filters",
                  onClick: () => {
                    setStatusFilter("all");
                    setSearchTerm("");
                  },
                }}
              />
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <StaggerChildren stagger={0.02} className="space-y-1">
              {filtered.map((inc) => {
                const sevColor =
                  inc.severity === "critical" ? "var(--ember-critical)"
                  : inc.severity === "high" ? "var(--ember-warning)"
                  : inc.severity === "medium" ? "var(--ember-info)"
                  : "var(--ember-success)";
                return (
                  <StaggerItem key={inc.id}>
                    <motion.button
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelectIncident(inc.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-md border border-transparent hover:bg-[var(--ember-surface-2)] hover:border-[var(--ember-border)] transition-all text-left"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: sevColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[var(--ember-text)] truncate">
                          {inc.displayName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--ember-text-faint)]">
                          <span style={{ color: sevColor }} className="uppercase tracking-wider font-semibold">
                            {inc.severity}
                          </span>
                          <span>·</span>
                          <span className="truncate">{inc.municipality || "—"}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-[var(--ember-text-muted)] uppercase tracking-wider font-medium">
                          {inc.status}
                        </div>
                        <div className="text-[10px] text-[var(--ember-text-faint)] font-mono mt-0.5">
                          {new Date(inc.firstDetected).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </div>
                      </div>
                    </motion.button>
                  </StaggerItem>
                );
              })}
            </StaggerChildren>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--ember-border)] flex items-center justify-between flex-shrink-0">
          <span className="text-[10px] text-[var(--ember-text-faint)]">
            {lang === "pt" ? `A mostrar ${filtered.length} de ${total} incêndios` : `Showing ${filtered.length} of ${total} incidents`}
          </span>
          <span className="text-[10px] text-[var(--ember-text-faint)]">
            {lang === "pt" ? "Toque num incêndio para ver detalhes" : "Click an incident to view details"}
          </span>
        </div>
    </OverlayDialog>
  );
}
