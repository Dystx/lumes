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
import { CollapsibleLegend } from "@/components/overlays/legend";
import { FiltersPanel } from "@/components/filters/filters-panel";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { EmberIcon, EmberFlameIcon } from "@/components/icons/brand-icons";
import { MobileView, type MobileTab } from "@/components/mobile/mobile-view";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";
import { LongPressActions } from "@/components/mobile/long-press-actions";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { SectionError } from "@/components/ui/section-error";
import { EmptyState } from "@/components/ui/empty/empty-state";
import { useUIStore } from "@/store/ui-store";
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
} from "@/components/icons/phosphor-icons";
import EmberMap, { type BasemapMode, type FireRiskFeature, type FireStationFeature, type EmberMapHandle } from "@/components/ember-map";
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
  useLiveIncidents,
  useFireRisk,
  useWeather,
  useDashboard,
  useFireStations,
  useSourceHealth,
  useRealtimeIncidents,
  usePersistenceStats,
  useHistory,
  useWeatherWarnings,
  useSatelliteDetections,
  useFollowedIncidents,
  findNearestStation,
  findFireRisk,
} from "@/lib/use-live-data";
import {
  useDashboardNew,
  useFireRiskNew, useWeatherNew,
  useFireStationsNew, useSourceHealthNew, useMatchedIncidentNews,
  usePersistenceStatsNew, useHistoryNew,
  useWeatherWarningsNew, useSatelliteNew,
} from "@/lib/use-app-data";
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

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  unverified: "Unverified",
  "single-source": "Single source",
  corroborated: "Corroborated",
  "officially-verified": "Officially verified",
};

// Localized source labels (PT/EN)
function sourceLabel(st: SourceType, lang: Language): string {
  if (lang === "pt") {
    const map: Record<SourceType, string> = {
      satellite: "Satélite",
      official: "Oficial",
      community: "Comunidade",
      news: "Notícias",
      weather: "Meteorologia",
    };
    return map[st] || st;
  }
  const map: Record<SourceType, string> = {
    satellite: "Satellite",
    official: "Official",
    community: "Community",
    news: "News",
    weather: "Weather",
  };
  return map[st] || st;
}

// Localized verification labels (PT/EN)
function verificationLabel(v: VerificationStatus, lang: Language): string {
  if (lang === "pt") {
    const map: Record<VerificationStatus, string> = {
      unverified: "Não verificado",
      "single-source": "Fonte única",
      corroborated: "Confirmado",
      "officially-verified": "Oficialmente verificado",
    };
    return map[v] || v;
  }
  const map: Record<VerificationStatus, string> = {
    unverified: "Unverified",
    "single-source": "Single source",
    corroborated: "Corroborated",
    "officially-verified": "Officially verified",
  };
  return map[v] || v;
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
  const liveIncidents = useLiveIncidents();
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
    severityFilter, toggleSeverity,
    criticalOnly, setCriticalOnly,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Read incident ID from URL query param on initial load (for share links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const incidentParam = params.get("incident");
    if (incidentParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIncidentId(incidentParam);
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const visibleIncidents = useMemo(() => {
    // When in playback mode (T-N hours), filter live incidents by time
    // Show incidents that were first detected before the playback timestamp
    if (playbackHour < 0 && liveIncidents.incidents.length > 0) {
      const playbackTime = Date.now() + playbackHour * 3600000;
      let pool = liveIncidents.incidents.filter((inc) => {
        const detected = new Date(inc.firstDetected || inc.observedAt).getTime();
        return detected <= playbackTime;
      });
      pool = pool.filter((inc) => severityFilter.has(inc.severity));
      if (criticalOnly) pool = pool.filter((inc) => inc.severity === "critical");
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        pool = pool.filter(
          (inc) =>
            inc.displayName.toLowerCase().includes(q) ||
            (inc.municipality || "").toLowerCase().includes(q) ||
            (inc.district || "").toLowerCase().includes(q) ||
            (inc.parish || "").toLowerCase().includes(q)
        );
      }
      return pool;
    }

    // If no live data, use sample data for playback
    if (playbackHour < 0 && liveIncidents.incidents.length === 0) {
      const frame = PLAYBACK_FRAMES.reduce((closest, f) =>
        Math.abs(f.hourOffset - playbackHour) <
        Math.abs(closest.hourOffset - playbackHour)
          ? f
          : closest
      );
      let pool = SAMPLE_INCIDENTS.filter((inc) =>
        frame.activeIncidentIds.includes(inc.id)
      );
      pool = pool.filter((inc) => severityFilter.has(inc.severity));
      if (criticalOnly) pool = pool.filter((inc) => inc.severity === "critical");
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        pool = pool.filter(
          (inc) =>
            inc.displayName.toLowerCase().includes(q) ||
            inc.municipality.toLowerCase().includes(q) ||
            inc.district.toLowerCase().includes(q) ||
            inc.parish.toLowerCase().includes(q)
        );
      }
      return pool;
    }

    // Live mode — use live incidents
    let pool = liveIncidents.incidents;

    // Apply severity filter
    let filtered = pool.filter((inc) => severityFilter.has(inc.severity));

    // Apply hide-resolved (default on — hides historical fires)
    if (hideResolved) {
      filtered = filtered.filter((inc) => inc.status !== "resolved");
    }

    // Apply critical-only
    if (criticalOnly) {
      filtered = filtered.filter((inc) => inc.severity === "critical");
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inc) =>
          inc.displayName.toLowerCase().includes(q) ||
          (inc.municipality || "").toLowerCase().includes(q) ||
          (inc.district || "").toLowerCase().includes(q) ||
          (inc.parish || "").toLowerCase().includes(q)
      );
    }

    // Apply operational-phase filter (from clicking a phase row in the dashboard)
    if (phaseFilter) {
      // Phase filter matches by raw ANEPC statusGroup / statusText first,
      // then falls back to the collapsed status via mapStatusGroup.
      filtered = filtered.filter((inc) => {
        const props = inc.properties ?? {};
        if (props.statusGroup === phaseFilter) return true;
        if (props.statusText === phaseFilter) return true;
        if (mapStatusGroup(props.statusText, inc.status) === phaseFilter) return true;
        return false;
      });
    }

    // Apply resource filter
    if (resourceFilter === "personnel") {
      filtered = filtered.filter((inc) => (inc.personnel ?? 0) > 0);
    } else if (resourceFilter === "engines") {
      filtered = filtered.filter((inc) => (inc.engines ?? 0) > 0);
    } else if (resourceFilter === "aircraft") {
      filtered = filtered.filter((inc) => (inc.aircraft ?? 0) > 0);
    }

    // Apply quickFilter (Total / Active / Critical / High counters on dashboard)
    if (quickFilter === "active") {
      filtered = filtered.filter((inc) => inc.status === "active" || inc.status === "detected");
    } else if (quickFilter === "critical") {
      filtered = filtered.filter((inc) => inc.severity === "critical");
    } else if (quickFilter === "high") {
      filtered = filtered.filter((inc) => inc.severity === "critical" || inc.severity === "high");
    }

    return filtered;
  }, [playbackHour, severityFilter, criticalOnly, hideResolved, searchQuery, liveIncidents.incidents, phaseFilter, resourceFilter, quickFilter]);

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
      // Try live incidents first, then sample data (for playback mode)
      const live = liveIncidents.incidents.find((i) => i.id === selectedIncidentId);
      if (live) return live;
      return SAMPLE_INCIDENTS.find((i) => i.id === selectedIncidentId) ?? null;
    },
    [selectedIncidentId, liveIncidents.incidents]
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
    setSelectedIncidentId(id);
  }, []);

  // When the user clicks a marker ON THE MAP, fly to it.
  // Sidebar/notification selections use handleSelectIncident (no fly).
  const handleSelectIncidentFromMap = useCallback((id: string | null) => {
    setSelectedIncidentId(id);
    if (id) setFlyToIncidentId(id);
  }, []);

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
    if (wasFollowing) {
      toast(t(lang, "toast.unfollowed"), { description: name });
    } else {
      toast.success(t(lang, "toast.followed"), {
        description: lang === "pt" ? `${name} — receberá atualizações` : `${name} — you'll get updates`,
      });
    }
    await toggleFollowPersisted(id);
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
  const [showShortcuts, setShowShortcuts] = useState(false);
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
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (notifOpen) {
          setNotifOpen(false);
        } else if (selectedIncidentId) {
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
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [notifOpen, showShortcuts, selectedIncidentId, handleRefresh, handleToggleFollow]);

  // ============================================================
  // Render
  // ============================================================

  // Active filter count for mobile FILTROS tab badge
  const activeFilterCount = (
    (quickFilter !== "all" ? 1 : 0) +
    severityFilter.size +
    (showFireRisk ? 1 : 0) +
    (showFireStations ? 1 : 0) +
    (showSatellite ? 1 : 0) +
    (showAerial ? 1 : 0) +
    (showBiomass ? 1 : 0) +
    (showCompositeRisk ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (criticalOnly ? 1 : 0) +
    (hideResolved ? 1 : 0)
  );

  return (
    <div className="h-screen w-full flex lg:overflow-hidden overflow-hidden flex-col lg:flex-row bg-[var(--ember-bg)] text-[var(--ember-text)] font-sans relative">
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
              className="ml-auto w-8 h-8 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
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
          />
        )}
      </BottomSheet>

      {/* ===== LEFT: SITUATIONAL DASHBOARD (always visible on desktop) ===== */}
      <div className="hidden lg:block h-full flex-shrink-0 w-[360px] border-r border-[var(--ember-border)]">
        <DashboardPanel
          key="dashboard"
          metrics={dashboardMetrics}
          topIncidents={topCriticalIncidents}
          recentHistory={history.data?.incidents ?? []}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            setFlyToIncidentId(id);
          }}
          onOpenHistory={() => setShowHistoryModal(true)}
          sourceHealth={sourceHealth.data?.sources ?? []}
          realtimeConnected={realtime.connected}
          persistenceStats={persistenceStats.data}
          usingFallback={liveIncidents.usingFallback}
          allIncidents={visibleIncidents}
          sortMode={sortMode}
          setSortMode={setSortMode}
          quickFilter={quickFilter}
          setQuickFilter={setQuickFilter}
          phaseFilter={phaseFilter}
          setPhaseFilter={setPhaseFilter}
          resourceFilter={resourceFilter}
          setResourceFilter={setResourceFilter}
          criticalOnly={criticalOnly}
          setCriticalOnly={setCriticalOnly}
          hideResolved={hideResolved}
          setHideResolved={setHideResolved}
          severityFilter={severityFilter}
          toggleSeverity={toggleSeverity}
          visibleSources={visibleSources}
          toggleSource={toggleSource}
          selectedIncidentId={selectedIncidentId}
          followedIncidentIds={followedIncidents}
          loading={dashboard.loading}
          lang={lang}
          dataFetchedAt={liveIncidents.refetchedAt}
          dashboardError={!!dashboard.error}
          onRetryDashboard={() => dashboard.refetch?.()}
        />
      </div>

      {/* ===== CENTER: MAP (desktop only — mobile uses MobileView's Map tab) ===== */}
      <main id="main-content" className="hidden lg:flex flex-1 relative flex-col min-w-0">
        {/* Top app bar — map controls only (brand is in dashboard panel header) */}
        <header className="hidden lg:flex sticky md:absolute top-0 left-0 right-0 z-30 justify-end items-center h-14 lg:h-16 px-3 lg:px-6 pointer-events-none select-none bg-transparent">
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
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--ember-critical)] text-white text-[10px] font-bold flex items-center justify-center animate-pulse tabular-nums"
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
            <EmberMap
              ref={mapRef}
              incidents={visibleIncidents}
              selectedIncidentId={selectedIncidentId}
              theme={(theme as "dark" | "light") || "dark"}
              basemap={basemap}
              visibleSources={visibleSources}
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
            className="absolute top-20 right-3 lg:right-6 z-10 flex flex-col gap-1.5 pointer-events-auto"
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
          <div className="absolute top-20 left-3 lg:left-6 z-10 flex items-center gap-2 pointer-events-auto">
            <div className="bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border-strong)] rounded-md px-3 py-1.5 text-xs text-[var(--ember-text)] shadow-[var(--ember-shadow-sm)] flex items-center gap-1.5 font-medium">
              <Flame className="w-3 h-3 text-[var(--ember-critical)] flex-shrink-0" />
              <span className="font-mono font-bold text-[var(--ember-text)]">
                {visibleIncidents.length}
              </span>
              <span className="text-[var(--ember-text-muted)]">{t(lang, "map.incidentsVisible")}</span>
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
          <div className="hidden lg:block">
            <CollapsibleLegend lang={lang} />
          </div>
          {/* Mobile mini-legend — inline severity dots */}
          <div className="lg:hidden absolute bottom-20 left-3 z-10 bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border-strong)] rounded-md px-2.5 py-1.5 shadow-[var(--ember-shadow-sm)] pointer-events-auto">
            <div className="flex items-center gap-2.5">
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => {
                const color =
                  s === "critical" ? "var(--ember-critical)"
                  : s === "high" ? "var(--ember-warning)"
                  : s === "medium" ? "var(--ember-info)"
                  : "var(--ember-success)";
                return (
                  <div key={s} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[8px] uppercase tracking-wider text-[var(--ember-text-muted)] font-medium">
                      {s.slice(0, 4)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Playback timeline — collapsed by default, expanded when active */}
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
        />
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
            criticalOnly={criticalOnly}
            setCriticalOnly={setCriticalOnly}
            hideResolved={hideResolved}
            setHideResolved={setHideResolved}
            visibleSources={visibleSources}
            toggleSource={toggleSource}
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
            activeFilters={[
              ...(quickFilter !== "all" ? [{
                id: `quick-${quickFilter}`,
                label: quickFilter === "active" ? t(lang, "dashboard.active") : quickFilter === "critical" ? t(lang, "dashboard.critical") : t(lang, "dashboard.high"),
                onClear: () => setQuickFilter("all"),
              }] : []),
              ...(severityFilter.size > 0 ? Array.from(severityFilter).map((s) => ({
                id: `sev-${s}`,
                label: t(lang, `severity.${s}`),
                onClear: () => toggleSeverity(s),
              })) : []),
              ...(searchQuery ? [{
                id: "search",
                label: `"${searchQuery}"`,
                onClear: () => setSearchQuery(""),
              }] : []),
              ...(showFireRisk ? [{ id: "risk", label: t(lang, "sidebar.fireRiskLayer"), onClear: () => setShowFireRisk(false) }] : []),
              ...(showFireStations ? [{ id: "stations", label: t(lang, "sidebar.fireStations"), onClear: () => setShowFireStations(false) }] : []),
              ...(showSatellite ? [{ id: "sat", label: t(lang, "dataSources.nasa-firms-viirs"), onClear: () => setShowSatellite(false) }] : []),
            ]}
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
      <div className="lg:hidden">
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
          onTapIncident={(id) => { setSelectedIncidentId(id); setFlyToIncidentId(id); }}
          lastUpdated={liveIncidents.refetchedAt || null}
          onRefresh={async () => {
            try {
              await Promise.all([
                liveIncidents.refetch?.(),
                dashboard.refetch?.(),
              ]);
            } catch {}
          }}
          activeFilters={[
            ...(quickFilter !== "all" ? [{
              id: `quick-${quickFilter}`,
              label: quickFilter === "active" ? t(lang, "dashboard.active") : quickFilter === "critical" ? t(lang, "dashboard.critical") : t(lang, "dashboard.high"),
              onClear: () => setQuickFilter("all"),
            }] : []),
            ...(phaseFilter ? [{
              id: `phase-${phaseFilter}`,
              label: phaseFilter,
              onClear: () => setPhaseFilter(null),
            }] : []),
            ...(resourceFilter ? [{
              id: `resource-${resourceFilter}`,
              label: resourceFilter === "personnel" ? "Com pessoal" : resourceFilter === "engines" ? "Com veículos" : "Com aeronaves",
              onClear: () => setResourceFilter(null),
            }] : []),
          ]}
          map={
            <div className="absolute inset-0">
              <EmberMap
                ref={mapRef}
                basemap={basemap}
                incidents={visibleIncidents}
                selectedIncidentId={selectedIncidentId}
                flyToIncidentId={flyToIncidentId}
                showFireRisk={showFireRisk}
                showFireStations={showFireStations && !!fireStations.data}
                showSatellite={showSatellite}
                visibleSources={visibleSources}
                fireRiskFeatures={fireRiskFeatures}
                weather={weather.data}
                onSelectIncident={handleSelectIncidentFromMap}
                onMarkerLongPress={(x, y, id) => setMarkerMenu({ x, y, incidentId: id })}
                lang={lang}
              />
            </div>
          }
          dashboard={
            <DashboardPanel
              metrics={dashboardMetrics}
              topIncidents={topCriticalIncidents}
              recentHistory={history.data?.incidents ?? []}
              onSelectIncident={(id) => { setSelectedIncidentId(id); setFlyToIncidentId(id); }}
              onOpenHistory={() => setShowHistoryModal(true)}
              sourceHealth={sourceHealth.data?.sources ?? []}
              realtimeConnected={realtime.connected}
              persistenceStats={persistenceStats.data}
              usingFallback={liveIncidents.usingFallback}
              allIncidents={visibleIncidents}
              sortMode={sortMode}
              setSortMode={setSortMode}
              quickFilter={quickFilter}
              setQuickFilter={setQuickFilter}
              phaseFilter={phaseFilter}
              setPhaseFilter={setPhaseFilter}
              resourceFilter={resourceFilter}
              setResourceFilter={setResourceFilter}
              criticalOnly={criticalOnly}
              setCriticalOnly={setCriticalOnly}
              hideResolved={hideResolved}
              setHideResolved={setHideResolved}
              severityFilter={severityFilter}
              toggleSeverity={toggleSeverity}
              visibleSources={visibleSources}
              toggleSource={toggleSource}
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
              quickFilter={quickFilter}
              setQuickFilter={setQuickFilter}
              severityFilter={severityFilter}
              toggleSeverity={toggleSeverity}
              criticalOnly={criticalOnly}
              setCriticalOnly={setCriticalOnly}
              hideResolved={hideResolved}
              setHideResolved={setHideResolved}
              visibleSources={visibleSources}
              toggleSource={toggleSource}
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
              activeFilters={[
                ...(quickFilter !== "all" ? [{
                  id: `quick-${quickFilter}`,
                  label: quickFilter === "active" ? t(lang, "dashboard.active") : quickFilter === "critical" ? t(lang, "dashboard.critical") : t(lang, "dashboard.high"),
                  onClear: () => setQuickFilter("all"),
                }] : []),
                ...(severityFilter.size > 0 ? Array.from(severityFilter).map((s) => ({
                  id: `sev-${s}`,
                  label: t(lang, `severity.${s}`),
                  onClear: () => toggleSeverity(s),
                })) : []),
                ...(searchQuery ? [{
                  id: "search",
                  label: `"${searchQuery}"`,
                  onClear: () => setSearchQuery(""),
                }] : []),
                ...(showFireRisk ? [{ id: "risk", label: t(lang, "sidebar.fireRiskLayer"), onClear: () => setShowFireRisk(false) }] : []),
                ...(showFireStations ? [{ id: "stations", label: t(lang, "sidebar.fireStations"), onClear: () => setShowFireStations(false) }] : []),
                ...(showSatellite ? [{ id: "sat", label: t(lang, "dataSources.nasa-firms-viirs"), onClear: () => setShowSatellite(false) }] : []),
              ]}
            />
          }
          more={
            <div className="p-4 space-y-3">
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                aria-label={tFmt(lang, "header.notificationsWithUnread", { count: unreadCount })}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] text-left"
              >
                <Bell className="w-5 h-5 text-[var(--ember-accent)]" aria-hidden="true" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t(lang, "header.viewNotifications")}</div>
                  <div className="text-[11px] text-[var(--ember-text-faint)]">{unreadCount} {t(lang, "mobile.unread")}</div>
                </div>
                {unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--ember-critical)] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg bg-[var(--ember-surface-2)] border border-[var(--ember-border)] hover:border-[var(--ember-border-strong)] text-left"
              >
                <HistoryIcon className="w-5 h-5 text-[var(--ember-accent)]" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t(lang, "mobile.history")}</div>
                  <div className="text-[11px] text-[var(--ember-text-faint)]">{persistenceStats.data?.total ?? 0} {t(lang, "mobile.historyDesc")}</div>
                </div>
              </button>
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
        body: JSON.stringify({
          reportType,
          latitude: location.lat,
          longitude: location.lon,
          description,
          reporterName: reporterName || "anonymous",
          reporterTier: "registered",
        }),
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-xl shadow-[var(--ember-shadow-lg)] w-[440px] max-w-[90vw] max-h-[90vh] overflow-y-auto ember-scroll"
        onClick={(e) => e.stopPropagation()}
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
      </motion.div>
    </motion.div>
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-xl shadow-[var(--ember-shadow-lg)] w-[600px] max-w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
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
                    setQuickFilter("all");
                    setCriticalOnly(false);
                    setHideResolved(false);
                    severityFilter.forEach((s) => toggleSeverity(s));
                    setSearchQuery("");
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
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// CollapsibleLegend extracted to src/components/overlays/legend.tsx (TASK C-leaves)
// Imported above


// ============================================================
// Playback bar (T-24h timeline)
// ============================================================
function PlaybackBar({
  hour,
  isPlaying,
  onSeek,
  onTogglePlay,
  onSkipBack,
  onSkipForward,
}: {
  hour: number;
  isPlaying: boolean;
  onSeek: (h: number) => void;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
}) {
  // Map hour (-24..0) to percentage (0..100)
  const pct = ((hour + 24) / 24) * 100;

  // Compact "Discover playback" pill when at hour=0
  if (hour === 0 && !isPlaying) {
    return (
      <div className="absolute bottom-4 right-3 lg:right-6 z-20">
        <button
          onClick={onTogglePlay}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border)] hover:border-[var(--ember-accent)] transition-colors shadow-[var(--ember-shadow-sm)] text-[11px] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)]"
          aria-label="Reproduzir histórico das últimas 24 horas"
          title="Reproduzir histórico"
        >
          <Play className="w-3 h-3 text-[var(--ember-accent)]" fill="currentColor" />
          <span className="font-medium">Reproduzir -24h</span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center px-3 lg:px-6 h-14 lg:h-20 bg-[var(--ember-bg)]/90 backdrop-blur-md border-t border-[var(--ember-border)]">
      <div className="flex items-center gap-2 lg:gap-3 pr-3 lg:pr-5 border-r border-[var(--ember-border)]">
        <button
          onClick={onSkipBack}
          className="text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
          aria-label={t(lang, "playback.skipBack")}
        >
          <SkipBack className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </button>
        <button
          onClick={onTogglePlay}
          className="w-7 h-7 md:w-8 md:h-8 rounded-md border border-[var(--ember-border)] bg-[var(--ember-surface)] text-[var(--ember-text)] flex items-center justify-center hover:bg-[var(--ember-surface-2)] transition-colors flex-shrink-0"
          aria-label={isPlaying ? (lang === "pt" ? "Pausar" : "Pause") : (lang === "pt" ? "Reproduzir" : "Play")}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 md:w-4 md:h-4" />
          ) : (
            <Play className="w-3.5 h-3.5 md:w-4 md:h-4 ml-0.5" fill="currentColor" />
          )}
        </button>
        <button
          onClick={onSkipForward}
          className="text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
          aria-label={t(lang, "playback.skipForward")}
        >
          <SkipForward className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 md:gap-1 ml-3 md:ml-5 min-w-0">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)]">
          <span className="hidden lg:flex items-center gap-1 font-medium">
            <Clock className="w-3 h-3" />
            {lang === "pt" ? "Reprodução Histórica" : "Historical Playback"}
          </span>
          <span className="lg:hidden font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {hour === 0 ? t(lang, "playback.now") : `T${hour}h`}
          </span>
          <span className="hidden md:inline font-mono text-[var(--ember-text-muted)]" aria-label={hour === 0 ? t(lang, "playback.nowLabel") : `${hour} horas atrás`}>
            {hour === 0 ? t(lang, "playback.now") : `T${hour}h`}
          </span>
        </div>
        <div
          className="relative h-1.5 bg-[var(--ember-surface-2)] rounded-full cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            onSeek(Math.round(x * 24 - 24));
          }}
        >
          {/* Filled track */}
          <div
            className="absolute top-0 left-0 h-full bg-[var(--ember-accent)] rounded-full"
            style={{ width: `${pct}%` }}
          />
          {/* Scrubber */}
          <div
            className="absolute top-1/2 w-3 h-4 bg-[var(--ember-text)] rounded-sm transform -translate-y-1/2 -translate-x-1/2 group-hover:scale-y-125 transition-transform"
            style={{ left: `${pct}%` }}
          />
          {/* Markers at key event times */}
          {[-22, -12, -10, -5, -2, -1].map((h) => (
            <div
              key={h}
              className="absolute top-0 h-full w-px bg-[var(--ember-critical)] opacity-50"
              style={{ left: `${((h + 24) / 24) * 100}%` }}
              title={`T${h}h event`}
            />
          ))}
        </div>
        <div className="hidden lg:flex justify-between text-[10px] font-mono text-[var(--ember-text-faint)] mt-1">
          <span>-24h</span>
          <span>-18h</span>
          <span>-12h</span>
          <span>-6h</span>
          <span className="text-[var(--ember-text-muted)]">NOW</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard Panel — situational awareness when no incident is selected
// ============================================================
function DashboardPanel({
  metrics,
  topIncidents,
  recentHistory,
  onSelectIncident,
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
  criticalOnly,
  setCriticalOnly,
  hideResolved,
  setHideResolved,
  severityFilter,
  toggleSeverity,
  visibleSources,
  toggleSource,
  selectedIncidentId,
  followedIncidentIds,
  loading,
  lang,
  dataFetchedAt,
  dashboardError,
  onRetryDashboard,
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
  topIncidents: any[];
  recentHistory: any[];
  onSelectIncident: (id: string) => void;
  onOpenHistory: () => void;
  sourceHealth: SourceHealth[];
  realtimeConnected: boolean;
  persistenceStats: { total: number; active: number; resolved: number; snapshots: number } | null;
  usingFallback: boolean;
  allIncidents: any[];
  sortMode: IncidentSort;
  setSortMode: (s: IncidentSort) => void;
  quickFilter: QuickFilter;
  setQuickFilter: (q: QuickFilter) => void;
  selectedIncidentId: string | null;
  followedIncidentIds: Set<string>;
  loading: boolean;
  dashboardError?: boolean;
  onRetryDashboard?: () => void;
  dashboardError?: boolean;
  onRetryDashboard?: () => void;
  phaseFilter: string | null;
  setPhaseFilter: (p: string | null) => void;
  resourceFilter: "personnel" | "engines" | "aircraft" | null;
  setResourceFilter: (r: "personnel" | "engines" | "aircraft" | null) => void;
  criticalOnly: boolean;
  setCriticalOnly: (v: boolean | ((p: boolean) => boolean)) => void;
  hideResolved: boolean;
  setHideResolved: (v: boolean | ((p: boolean) => boolean)) => void;
  severityFilter: Set<Severity>;
  toggleSeverity: (s: Severity) => void;
  visibleSources: Set<SourceType>;
  toggleSource: (s: SourceType) => void;
  lang: Language;
  dataFetchedAt: Date | null;
}) {
  const [activityTab, setActivityTab] = useState<"critical" | "recent" | "all">("critical");
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

  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex w-[360px] h-full flex-col bg-[var(--ember-bg)] border-r border-[var(--ember-border)] flex-shrink-0 z-20 relative"
    >
      {/* Header — section title + live status (brand is in the top header) */}
      <div className="px-5 py-3 border-b border-[var(--ember-border)] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[var(--ember-accent-subtle)] flex items-center justify-center">
              <EmberIcon className="w-4 h-4 text-[var(--ember-accent)]" />
            </div>
            <div>
              <h2
                className="text-[15px] font-semibold text-[var(--ember-text)] leading-none font-display tracking-tight"
                style={{ fontVariationSettings: "'opsz' 14" }}
              >
                {t(lang, "dashboard.title")}
              </h2>
              <p className="text-[10px] text-[var(--ember-text-faint)] leading-none mt-1">
                {t(lang, "dashboard.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${realtimeConnected ? "bg-[var(--ember-accent)] animate-pulse" : usingFallback ? "bg-[var(--ember-warning)]" : "bg-[var(--ember-text-faint)]"}`} />
            <span className="text-[var(--ember-text-muted)] font-medium uppercase tracking-wider">
              {realtimeConnected ? t(lang, "live.rt") : usingFallback ? t(lang, "live.fb") : t(lang, "live.live")}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto ember-scroll">
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
              active={quickFilter === "all" && !criticalOnly}
              onClick={() => { setQuickFilter("all"); setCriticalOnly(false); }}
            />
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              <HeroCounter
                label={lang === "pt" ? "Ativos" : "Active"}
                value={metrics.activeCount}
                icon={Radio}
                color="var(--ember-critical)"
                pulse={metrics.activeCount > 0}
                active={quickFilter === "active"}
                onClick={() => { setQuickFilter(quickFilter === "active" ? "all" : "active"); }}
              />
              <HeroCounter
                label={t(lang, "dashboard.critical")}
                value={metrics.criticalCount}
                icon={AlertTriangle}
                color="var(--ember-critical)"
                active={quickFilter === "critical" || criticalOnly}
                onClick={() => {
                  if (quickFilter === "critical") {
                    setQuickFilter("all");
                    setCriticalOnly(false);
                  } else {
                    setQuickFilter("critical");
                    setCriticalOnly(true);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Top districts breakdown — replaces duplicate stats grid.
            Shows which districts have the most active fires. */}
        <div className="px-4 py-3 border-b border-[var(--ember-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2">
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
                      setSearchQuery(d.name);
                    }}
                    className="w-full flex items-center gap-2 group"
                  >
                    <span className="text-[10px] text-[var(--ember-text)] w-20 truncate text-left group-hover:text-[var(--ember-accent)] transition-colors">
                      {d.name}
                    </span>
                    <div className="flex-1 h-1.5 bg-[var(--ember-surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--ember-accent)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[var(--ember-text-faint)] w-6 text-right">
                      {d.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resources deployed */}
        <div className="px-4 py-4 border-b border-[var(--ember-border)]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
              {t(lang, "dashboard.resourcesDeployed")}
            </div>
            {resourceFilter && (
              <button
                type="button"
                onClick={() => setResourceFilter(null)}
                className="text-[10px] text-[var(--ember-accent)] hover:underline flex items-center gap-1"
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
              <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                Total area burned
              </span>
              <span className="text-sm font-mono font-bold text-[var(--ember-critical)]">
                {metrics.areaHa < 1
                  ? `${Math.round(metrics.areaHa * 100) / 100}`
                  : metrics.areaHa.toLocaleString()}{" "}
                <span className="text-[10px] text-[var(--ember-text-faint)]">ha</span>
              </span>
            </div>
          )}
        </div>

        {/* Operational phases (EstadoAgrupado) — all raw ANEPC statuses */}
        {(dashboardError && metrics.total === 0) ? (
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
        )}

        {/* Tabs — Priority / Recent / All */}
        <div className="px-4 pt-3 border-b border-[var(--ember-border)]">
          <div className="flex gap-4">
            {([
              { v: "critical", label: t(lang, "dashboard.activityPriority") },
              { v: "recent", label: t(lang, "dashboard.activityRecent") },
              { v: "all", label: t(lang, "dashboard.activityAll") },
            ] as { v: "critical" | "recent" | "all"; label: string }[]).map((t) => (
              <button
                key={t.v}
                onClick={() => setActivityTab(t.v)}
                className={`pb-2 text-[11px] uppercase tracking-wider font-medium border-b-2 transition-colors ${
                  activityTab === t.v
                    ? "border-[var(--ember-accent)] text-[var(--ember-text)]"
                    : "border-transparent text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Incident list — priority or recent or all */}
        <div className="px-4 py-3">
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
                <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  {t(lang, "dashboard.topPriority")}
                </span>
                {topIncidents.length > 0 && (
                  <span className="text-[10px] text-[var(--ember-text-faint)] tabular-nums">
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
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[var(--ember-text-faint)]">
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
                              <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-[var(--ember-text-faint)]">
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
                <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  Recent Activity
                </span>
                <button
                  onClick={onOpenHistory}
                  className="text-[10px] text-[var(--ember-accent)] hover:underline"
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
                        onClick={() => onSelectIncident(inc.id)}
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
                          <div className="text-[9px] text-[var(--ember-text-faint)] truncate">
                            {inc.municipality || "—"} · {inc.status}
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-[var(--ember-text-faint)] flex-shrink-0">
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
                <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
                  All Active Incidents
                </span>
                <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
                  {sortedAllIncidents.length}
                </span>
              </div>
              {/* Quick filter chips */}
              <div className="flex items-center gap-1 mb-2 overflow-x-auto ember-scroll-x">
                {([
                  { v: "all", label: t(lang, "dashboard.quickFilterAll") },
                  { v: "critical", label: t(lang, "dashboard.quickFilterCritical") },
                  { v: "high", label: t(lang, "dashboard.quickFilterHigh") },
                  { v: "active", label: t(lang, "dashboard.quickFilterActive") },
                ] as { v: QuickFilter; label: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setQuickFilter(opt.v)}
                    className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-semibold whitespace-nowrap transition-colors border ${
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
                <span className="text-[9px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex-shrink-0">
                  Sort
                </span>
                <div className="relative flex-1">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as IncidentSort)}
                    className="w-full appearance-none bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded px-2 py-1 text-[10px] text-[var(--ember-text)] focus:border-[var(--ember-accent)] focus:outline-none cursor-pointer pr-5"
                  >
                    <option value="recent">{lang === "pt" ? "Mais recentes" : "Most recent"}</option>
                    <option value="severity">{lang === "pt" ? "Severidade" : "Severity"}</option>
                    <option value="area">{lang === "pt" ? "Maior área" : "Largest area"}</option>
                    <option value="personnel">{lang === "pt" ? "Mais operacionais" : "Most personnel"}</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ember-text-faint)] pointer-events-none" />
                </div>
              </div>
              {/* List */}
              {sortedAllIncidents.length === 0 ? (
                <div className="px-2 py-3">
                  <EmptyState variant="no-results" lang={lang} compact />
                </div>
              ) : (
                <StaggerChildren stagger={0.012} className="space-y-0.5">
                  {sortedAllIncidents.map((inc) => {
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
                              <div className="flex items-center gap-1 mt-0.5 text-[9px] text-[var(--ember-text-faint)]">
                                <span style={{ color: sevColor }} className="uppercase tracking-wider font-semibold">
                                  {inc.severity}
                                </span>
                                <span>·</span>
                                <span className="truncate">{inc.municipality || inc.district || "—"}</span>
                              </div>
                              {(inc.estimatedAreaHa > 0 || inc.personnel > 0) && (
                                <div className="flex items-center gap-2 mt-0.5 text-[9px] font-mono text-[var(--ember-text-faint)]">
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
        {typeEntries.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--ember-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2.5">
              Distribution by Type
            </div>
            <div className="space-y-1.5">
              {typeEntries.map(([type, count]) => {
                const pct = (count / maxTypeCount) * 100;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--ember-text-muted)] capitalize w-24 truncate">
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
                    <span className="text-[10px] font-mono text-[var(--ember-text-faint)] w-6 text-right">
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
            <span className="text-[9px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5" />
              {t(lang, "dashboard.systemHealth")}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-[var(--ember-text-muted)]">
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
        {persistenceStats && persistenceStats.total > 0 && (
          <button
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
              <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
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

// DashStat + ResourceStat extracted to src/components/dashboard/stat-card.tsx (TASK C-leaves)
// Imported below

// ============================================================
// Incident detail panel
// ============================================================
function IncidentDetailPanel({
  incident,
  onClose,
  isFollowed,
  onToggleFollow,
  lang,
  isMobile = false,
  hideHeader = false,
}: {
  incident: Incident;
  onClose: () => void;
  isFollowed: boolean;
  onToggleFollow: () => void;
  lang: Language;
  isMobile?: boolean;
  hideHeader?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "sources">(
    "overview"
  );

  const Wrapper = hideHeader ? "div" : motion.aside;
  const wrapperProps = hideHeader
    ? { className: "h-full flex flex-col bg-transparent" }
    : {
        initial: { x: "-100%", opacity: 0.6 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "-100%", opacity: 0 },
        transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
        className: "w-full md:w-[360px] h-full flex flex-col bg-[var(--ember-bg)] border-r border-[var(--ember-border)] flex-shrink-0 z-30 md:relative absolute left-0 top-0",
      };

  return (
    <Wrapper {...(wrapperProps as any)}>
      {/* Header */}
      <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 md:pb-4 border-b border-[var(--ember-border)] flex-shrink-0">
        {isFollowed && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] text-[10px] font-medium uppercase tracking-wider w-fit">
            <Bell className="w-3 h-3 fill-current" />
            <span>{t(lang, "incident.followingBadge")}</span>
          </div>
        )}
        <div className="flex justify-between items-start gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-base font-semibold text-[var(--ember-text)] leading-tight truncate">
              {incident.displayName}
            </h2>
            <div className="flex items-center gap-1 text-[11px] text-[var(--ember-text-muted)] mt-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{incident.parish}, {incident.municipality}, {incident.district}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => {
                const url = `${window.location.origin}/?incident=${encodeURIComponent(incident.id)}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast.success(t(lang, "incident.shareCopied"), { description: t(lang, "incident.shareDescription") });
                }).catch(() => {
                  toast(t(lang, "incident.shareTitle") + ": " + url);
                });
              }}
              className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-accent)] hover:bg-[var(--ember-surface-2)] transition-colors"
              aria-label="Share incident"
              title="Copy share link"
            >
              <Navigation className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className={`${isMobile ? "hidden " : ""}w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors`}
              aria-label={t(lang, "a11y.closePanel")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status row — shows collapsed state group + raw operational phase */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[10px] uppercase tracking-wider">
          <span
            className={`flex items-center gap-1.5 font-medium ${
              incident.status === "active" || incident.status === "detected"
                ? "text-[var(--ember-critical)]"
                : incident.status === "contained"
                ? "text-[var(--ember-warning)]"
                : "text-[var(--ember-text-muted)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                incident.status === "active"
                  ? "bg-[var(--ember-critical)] animate-pulse"
                  : "bg-current"
              }`}
            />
            {STATUS_LABEL[incident.status]}
          </span>
          {incident.properties?.statusText && incident.properties.statusText !== STATUS_LABEL[incident.status] && (
            <span className="w-px h-3 bg-[var(--ember-border)]" />
          )}
          {incident.properties?.statusText && incident.properties.statusText !== STATUS_LABEL[incident.status] && (
            <span className="text-[var(--ember-text-muted)] normal-case tracking-normal font-mono text-[10px]">
              {statusRawLabel(incident.properties.statusText, lang)}
            </span>
          )}
          <span className="w-px h-3 bg-[var(--ember-border)]" />
          <span className="text-[var(--ember-text-muted)]">
            {lang === "pt" ? "Severidade" : "Severity"}:{" "}
            <span className="text-[var(--ember-text)] font-medium">
              {SEVERITY_LABEL[incident.severity]}
            </span>
          </span>
          <span className="w-px h-3 bg-[var(--ember-border)]" />
          <span className="text-[var(--ember-text-muted)]">
            {timeAgo(incident.lastUpdated, lang)}
          </span>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] font-medium">
            <ShieldCheck className="w-3 h-3" />
            {verificationLabel(incident.verification, lang)}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] font-medium">
            <TrendingUp className="w-3 h-3" />
            {Math.round(incident.confidence * 100)}% {t(lang, "incident.confidence")}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] font-medium">
            <Radio className="w-3 h-3" />
            {incident.sourceCount} {lang === "pt" ? "fontes" : "sources"}
          </span>
        </div>

        {/* Source type dots */}
        <div className="flex gap-1.5 mt-2">
          {incident.sourceTypes.map((st) => {
            const Icon = SOURCE_ICON[st];
            return (
              <span
                key={st}
                className="flex items-center gap-1 text-[10px] text-[var(--ember-text-faint)]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      st === "satellite"
                        ? "var(--ember-source-satellite)"
                        : st === "official"
                        ? "var(--ember-source-official)"
                        : st === "community"
                        ? "var(--ember-source-community)"
                        : st === "news"
                        ? "var(--ember-source-news)"
                        : "var(--ember-source-weather)",
                  }}
                />
                {sourceLabel(st, lang)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto ember-scroll">
        {/* Tabs */}
        <div className="flex gap-4 px-4 md:px-5 pt-3 md:pt-4 border-b border-[var(--ember-border)] sticky top-0 bg-[var(--ember-bg)] z-10">
          {(["overview", "timeline", "sources"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-[11px] uppercase tracking-wider font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[var(--ember-accent)] text-[var(--ember-text)]"
                  : "border-transparent text-[var(--ember-text-faint)] hover:text-[var(--ember-text-muted)]"
              }`}
            >
              {t(lang, tab === "overview" ? "incident.overview" : tab === "timeline" ? "incident.timeline" : "incident.sources")}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === "overview" && (
                <OverviewTab incident={incident} lang={lang} />
              )}
              {activeTab === "timeline" && (
                <TimelineTab incident={incident} lang={lang} />
              )}
              {activeTab === "sources" && <SourcesTab incident={incident} lang={lang} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-3 md:p-4 border-t border-[var(--ember-border)] bg-[var(--ember-surface)] flex flex-col gap-2 flex-shrink-0">
        {incident.evacuationOrder && (
          <div className="px-3 py-2 rounded-md bg-[var(--ember-critical-subtle)] border border-[var(--ember-critical)]/30 text-xs text-[var(--ember-critical)] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">{lang === "pt" ? "Ordem de evacuação ativa" : "Evacuation order active"}</div>
              <div className="text-[var(--ember-critical)]/80 normal-case tracking-normal">
                {lang === "pt" ? "Siga as instruções oficiais da proteção civil. Abrigo:" : "Follow official civil protection instructions. Shelter:"}{" "}
                {incident.municipality} {lang === "pt" ? "pavilhão" : "pavilion"}.
              </div>
            </div>
          </div>
        )}
        <AnimatedButton
          variant={isFollowed ? "accent" : "default"}
          className={`w-full text-[11px] uppercase tracking-wider font-medium py-2 ${
            !isFollowed ? "bg-[var(--ember-surface-2)]" : ""
          }`}
          onClick={onToggleFollow}
        >
          <Bell className="w-3.5 h-3.5" />
          {isFollowed ? t(lang, "incident.following") : t(lang, "incident.followIncident")}
        </AnimatedButton>
      </div>
    </Wrapper>
  );
}

// ============================================================
// Overview tab
// ============================================================
function OverviewTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const sevColor =
    incident.severity === "critical" ? "var(--ember-critical)"
    : incident.severity === "high" ? "var(--ember-warning)"
    : incident.severity === "medium" ? "var(--ember-info)"
    : "var(--ember-success)";

  // Fetch news matched to this incident's location
  const matchedNews = useMatchedIncidentNews(incident.id);

  return (
    <div className="flex flex-col gap-3">
      {/* Description */}
      <p className="text-xs leading-relaxed text-[var(--ember-text-muted)] break-words line-clamp-3">
        {incident.description}
      </p>

      {/* Conditions — metric cards */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {t(lang, "incident.conditions")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            icon={Wind}
            label={t(lang, "incident.wind")}
            value={incident.windKmh > 0 ? `${incident.windKmh}` : "—"}
            unit={incident.windKmh > 0 ? `km/h ${incident.windDirection}` : ""}
          />
          <MetricCard
            icon={Droplets}
            label={t(lang, "incident.humidity")}
            value={incident.humidity > 0 ? `${incident.humidity}` : "—"}
            unit={incident.humidity > 0 ? "%" : ""}
            danger={incident.humidity > 0 && incident.humidity < 20}
          />
          <MetricCard
            icon={Thermometer}
            label={t(lang, "incident.temp")}
            value={incident.temperatureC > 0 ? `${incident.temperatureC}` : "—"}
            unit={incident.temperatureC > 0 ? "°C" : ""}
            danger={incident.temperatureC > 32}
          />
        </div>
      </div>

      {/* Resources deployed */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {t(lang, "incident.resources")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard icon={Plane} label={t(lang, "incident.aircraft")} value={`${incident.aircraft}`} unit={t(lang, "incident.aircraftActive")} accent={incident.aircraft > 0} />
          <MetricCard icon={Truck} label={t(lang, "incident.engines")} value={`${incident.engines}`} unit={t(lang, "incident.enginesDeployed")} accent={incident.engines > 0} />
          <MetricCard icon={Users} label={t(lang, "incident.personnel")} value={`${incident.personnel}`} unit={t(lang, "incident.personnelOnScene")} accent={incident.personnel > 0} />
        </div>
      </div>

      {/* Area + Risk — side by side */}
      <div className="grid grid-cols-2 gap-2">
        {/* Area */}
        <div className="bg-[var(--ember-surface-2)] rounded-lg p-3 border border-[var(--ember-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1.5 font-medium">
            {t(lang, "incident.areaBurned")}
          </div>
          {incident.estimatedAreaHa > 0 ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-mono font-bold" style={{ color: sevColor }}>
                  {incident.estimatedAreaHa.toLocaleString()}
                </span>
                <span className="text-[10px] text-[var(--ember-text-faint)]">ha</span>
              </div>
              <div className="text-[10px] text-[var(--ember-text-faint)] mt-0.5">
                ≈ {(incident.estimatedAreaHa * 0.01).toFixed(2)} km²
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--ember-text-muted)] italic">
              {t(lang, "incident.notEstimated")}
            </div>
          )}
        </div>

        {/* IPMA Risk */}
        <div className="bg-[var(--ember-surface-2)] rounded-lg p-3 border border-[var(--ember-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1.5 font-medium">
            {t(lang, "incident.fireRisk")}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
              style={{
                background:
                  incident.ipmaRisk === "maximum" ? "var(--ember-critical)"
                  : incident.ipmaRisk === "very_high" ? "var(--ember-warning)"
                  : incident.ipmaRisk === "high" ? "var(--ember-info)"
                  : "var(--ember-success)",
                color: incident.ipmaRisk === "maximum" || incident.ipmaRisk === "very_high" ? "white" : "var(--ember-text)",
              }}
            >
              {t(lang, `risk.${incident.ipmaRisk === "very_high" ? "veryHigh" : incident.ipmaRisk}`)}
            </span>
          </div>
          <div className="text-[10px] text-[var(--ember-text-faint)] mt-1 truncate">{t(lang, "incident.sourceIPMA")}</div>
        </div>
      </div>

      {/* First detected */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--ember-text-faint)]">
        <Clock className="w-3 h-3" />
        {t(lang, "incident.firstDetected")} {formatDate(incident.firstDetected)} {formatTime(incident.firstDetected)} UTC
      </div>

      {/* Road closures */}
      {incident.roadClosures && incident.roadClosures.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-2 font-medium">
            {t(lang, "incident.roadClosures")}
          </div>
          <div className="space-y-1.5">
            {incident.roadClosures.map((road) => (
              <div
                key={road}
                className="flex items-center gap-2 text-sm text-[var(--ember-text-muted)] bg-[var(--ember-surface-2)] px-3 py-2 rounded-md border border-[var(--ember-border)]"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--ember-warning)] flex-shrink-0" />
                {road}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched press articles for this incident's location */}
      {matchedNews.data?.items && matchedNews.data.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex items-center gap-1.5">
              <Newspaper className="w-3 h-3" />
              {lang === "pt" ? "Imprensa sobre este local" : "Press for this location"}
            </div>
            <span className="text-[10px] text-[var(--ember-text-faint)] tabular-nums">
              {matchedNews.data.items.length} {lang === "pt" ? "artigos" : "articles"}
            </span>
          </div>
          <div className="space-y-1.5">
            {matchedNews.data.items.map((item) => (
              <a
                key={item.id}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30 hover:border-[var(--ember-accent)] rounded-md p-2.5 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <Flame className="w-3 h-3 mt-0.5 text-[var(--ember-accent)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-[var(--ember-text)] leading-tight line-clamp-2 group-hover:text-[var(--ember-accent)] transition-colors">
                      {item.title}
                    </div>
                    {item.summary && (
                      <div className="text-[10px] text-[var(--ember-text-muted)] mt-1 line-clamp-2 leading-relaxed">
                        {item.summary}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-[var(--ember-text-faint)]">
                      <span className="font-semibold uppercase tracking-wider text-[var(--ember-accent)]">
                        {item.source}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(item.publishedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                      </span>
                      {item.matchedOn && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--ember-accent)] font-medium">
                            {item.matchedOn}
                          </span>
                        </>
                      )}
                      <ExternalLink className="w-2.5 h-2.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  danger,
  accent,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
  unit: string;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2.5 border transition-all hover:scale-[1.02] hover:shadow-sm ${
      accent
        ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]/30 hover:border-[var(--ember-accent)]/60"
        : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
    }`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-lg font-mono font-bold ${
            danger ? "text-[var(--ember-critical)]"
            : accent ? "text-[var(--ember-accent)]"
            : "text-[var(--ember-text)]"
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-[10px] text-[var(--ember-text-faint)]">{unit}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Timeline tab
// ============================================================
function TimelineTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/incidents/${encodeURIComponent(incident.id)}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSnapshots(data.snapshots || []);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLoading(false);
        }
      })
      .catch(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [incident.id]);

  // Combine persisted snapshots with any inline timeline events
  const allEvents = useMemo(() => {
    const events: Array<{
      id: string;
      timestamp: string;
      sourceType: SourceType;
      sourceName: string;
      title: string;
      description: string;
      confidence: number;
      note?: string;
    }> = [];

    // Add persisted snapshots (from Prisma)
    for (const snap of snapshots) {
      events.push({
        id: snap.id,
        timestamp: snap.timestamp,
        sourceType: "official" as const,
        sourceName: "ANEPC (persisted)",
        title: snap.note?.includes("→")
          ? snap.note.split(";")[0] // First change as title
          : snap.statusText || snap.status,
        description: snap.note || `${snap.status} · ${snap.severity} · ${snap.personnelTotal} personnel`,
        confidence: 0.95,
        note: snap.note,
      });
    }

    // Add inline timeline events (from the incident object itself)
    for (const evt of (incident as Incident).timeline || []) {
      events.push(evt);
    }

    // Sort newest first
    return events.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [snapshots, incident]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1 font-medium">
          Loading timeline…
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton width={14} height={14} className="rounded-full mt-0.5" />
            <div className="flex-1 space-y-1">
              <Skeleton width="40%" height={10} />
              <Skeleton width="80%" height={8} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          Activity timeline
        </span>
        <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
          {allEvents.length} events
        </span>
      </div>

      {allEvents.length === 0 && (
        <div className="text-xs text-[var(--ember-text-faint)] text-center py-6">
          No timeline events recorded yet.
        </div>
      )}

      <div className="relative">
        {allEvents.length > 0 && (
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--ember-border)]" />
        )}

        <StaggerChildren stagger={0.04} className="flex flex-col gap-4">
          {allEvents.map((evt, idx) => {
            const Icon = SOURCE_ICON[evt.sourceType] || ShieldCheck;
            const dotColor =
              evt.sourceType === "satellite"
                ? "var(--ember-source-satellite)"
                : evt.sourceType === "official"
                ? "var(--ember-source-official)"
                : evt.sourceType === "community"
                ? "var(--ember-source-community)"
                : "var(--ember-source-weather)";
            return (
              <StaggerItem key={evt.id || idx}>
                <div className="relative pl-6">
                  <div
                    className="absolute left-1 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--ember-bg)] flex items-center justify-center"
                    style={{ background: dotColor }}
                  >
                    <Icon className="w-2 h-2 text-white" />
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
                      {formatDate(evt.timestamp)} {formatTime(evt.timestamp)} UTC
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[var(--ember-border)] font-medium" style={{ color: dotColor }}>
                      {sourceLabel(evt.sourceType, lang) || evt.sourceType}
                    </span>
                  </div>

                  <div className="text-sm font-medium text-[var(--ember-text)] mb-0.5">
                    {evt.title}
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--ember-text-muted)]">
                    {evt.description}
                  </p>
                  <div className="text-[10px] text-[var(--ember-text-faint)] mt-1">
                    {evt.sourceName} · {Math.round(evt.confidence * 100)}% confidence
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerChildren>
      </div>
    </div>
  );
}

// ============================================================
// Sources tab
// ============================================================
function SourcesTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const sourcesByType = useMemo(() => {
    const map = new Map<SourceType, TimelineEvent[]>();
    for (const evt of incident.timeline) {
      if (!map.has(evt.sourceType)) map.set(evt.sourceType, []);
      map.get(evt.sourceType)!.push(evt);
    }
    return map;
  }, [incident]);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
        Source breakdown ({incident.sourceCount} contributing sources)
      </div>

      {Array.from(sourcesByType.entries()).map(([type, events]) => {
        const Icon = SOURCE_ICON[type];
        const color =
          type === "satellite"
            ? "var(--ember-source-satellite)"
            : type === "official"
            ? "var(--ember-source-official)"
            : type === "community"
            ? "var(--ember-source-community)"
            : type === "news"
            ? "var(--ember-source-news)"
            : "var(--ember-source-weather)";
        return (
          <div key={type} className="border border-[var(--ember-border)] rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-sm font-medium text-[var(--ember-text)]">
                  {sourceLabel(type, lang)}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)]">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[var(--ember-text-muted)]">
                    {evt.sourceName}
                  </span>
                  <span className="text-[var(--ember-text-faint)] font-mono">
                    {formatTime(evt.timestamp)} · {Math.round(evt.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-2 p-3 bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30 rounded-md text-xs text-[var(--ember-text-muted)] leading-relaxed">
        <div className="flex items-center gap-1.5 text-[var(--ember-accent)] font-medium mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Trust envelope
        </div>
        Aggregate confidence:{" "}
        <span className="font-mono text-[var(--ember-text)]">
          {Math.round(incident.confidence * 100)}%
        </span>
        . Verification status:{" "}
        <span className="text-[var(--ember-text)]">
          {verificationLabel(incident.verification, lang)}
        </span>
        . Trust engine v1.0 — confidence computed from source reputation,
        corroboration count, and freshness decay.
      </div>
    </div>
  );
}

// ============================================================
// Notifications drawer
// ============================================================
function NotificationsDrawer({
  notifications,
  onClose,
  onMarkAllRead,
  onSelectIncident,
  lang,
}: {
  notifications: any[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelectIncident: (id: string) => void;
  lang: Language;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[400px] h-full bg-[var(--ember-bg)] border-l border-[var(--ember-border)] flex flex-col shadow-[var(--ember-shadow-lg)]"
      >
        <div className="px-5 py-4 border-b border-[var(--ember-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--ember-text)]">
              Notifications
            </h2>
            <p className="text-xs text-[var(--ember-text-faint)] mt-0.5">
              {notifications.filter((n) => !n.read).length} unread
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="text-xs text-[var(--ember-accent)] hover:underline"
              aria-label={t(lang, "a11y.markAllRead")}
            >
              {t(lang, "a11y.markAllRead")}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
              aria-label={t(lang, "a11y.closeNotifications")}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto ember-scroll p-3 flex flex-col gap-2">
          <StaggerChildren stagger={0.06}>
          {notifications.map((n) => {
            const incident = SAMPLE_INCIDENTS.find((i) => i.id === n.incidentId);
            const priorityColor =
              n.priority === "critical"
                ? "var(--ember-critical)"
                : n.priority === "standard"
                ? "var(--ember-warning)"
                : "var(--ember-text-faint)";
            return (
              <StaggerItem key={n.id}>
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectIncident(n.incidentId)}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  n.read
                    ? "bg-[var(--ember-surface)] border-[var(--ember-border)] opacity-70"
                    : "bg-[var(--ember-surface)] border-[var(--ember-border)] hover:border-[var(--ember-accent)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: priorityColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-[var(--ember-text)]">
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ember-accent)] flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--ember-text-muted)] leading-relaxed mb-1.5">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--ember-text-faint)]">
                      <span className="uppercase tracking-wider font-medium" style={{ color: priorityColor }}>
                        {n.priority}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(n.timestamp)}</span>
                      {incident && (
                        <>
                          <span>·</span>
                          <span>{incident.displayName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
              </StaggerItem>
            );
          })}
          </StaggerChildren>
        </div>

        <div className="p-3 border-t border-[var(--ember-border)] text-[10px] text-[var(--ember-text-faint)] text-center">
          Notification engine · Critical alerts bypass quiet hours
        </div>
      </motion.aside>
    </div>
  );
}
