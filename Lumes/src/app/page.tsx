"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useLanguage } from "@/lib/use-language";
import { t, tFmt } from "@/lib/i18n";
import { reconcilePriorityIncidents } from "@/lib/incident";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { SituationPanel } from "@/components/shell/situation-panel";
import { HomeShell } from "@/components/shell/home-shell";
import { IncidentDetailPanel, NotificationsDrawer, type IncidentDetailPanelProps } from "@/components/detail/IncidentDetailPanel";
import { HistoryModal } from "@/components/history/history-modal";
import { ReportFireModal } from "@/components/reports/report-fire-modal";
import { CollapsibleLegend } from "@/components/overlays/legend";
import { FiltersPanel, type FiltersPanelProps } from "@/components/filters/filters-panel";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { EmberFlameIcon } from "@/components/icons/brand-icons";
import { MobileView, type MobileTab } from "@/components/mobile/mobile-view";
import { LongPressActions } from "@/components/mobile/long-press-actions";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import type { FilterStatusItem } from "@/components/filters/filter-status";
import { useUIStore } from "@/store/ui-store";
import { buildActiveFilters, type IncidentFilterState } from "@/lib/incident-filters";
import { localizeActiveFilterLabel } from "@/lib/active-filter-labels";
import { countIncidentSeverities } from "@/lib/map-status-summary";
import { decideIncidentSelection, type IncidentSelectionSource } from "@/lib/incident-selection";
import { deriveVisibleIncidents } from "@/lib/visible-incidents";
import {
  Flame,
  Bell,
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
  Plane,
  Trees,
  Truck,
  Droplets,
  Thermometer,
  Radio,
  Bookmark,
  ChevronDown,
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
import { type FireRiskFeature, type FireStationFeature, type EmberMapHandle } from "@/components/ember-map";
import { toFireRiskFeatures, toFireStationFeatures, toSatelliteFeatures } from "@/components/map/map-data-adapter";
import { normalizeMapTheme } from "@/lib/map/map-style";
import { MapChrome } from "@/components/map/map-chrome";
import { deriveMapChromeInsets } from "@/lib/map-chrome";
import { deriveLayerAvailability } from "@/lib/map-layer-legend";
import { IncidentFocusControls } from "@/components/map/incident-focus-controls";
import { useIncidentFocus } from "@/lib/use-incident-focus";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { PlaybackBar } from "@/components/playback-bar";
import dynamic from "next/dynamic";

// Lazy-loaded UI: layer panel + advanced overlays.
const AdvancedMapLayers = dynamic(() => import("@/components/advanced-layers-host"), { ssr: false });
const NewsSection = dynamic(() => import("@/components/news-section"), { ssr: false });
// MapLibre is the heaviest client dependency. Keep the operational map as
// the default experience, but defer its startup until the shell is idle so
// the initial page can paint without blocking on WebGL setup.
const MapScene = dynamic(
  () => import("@/components/map/deferred-map-scene").then((mod) => mod.DeferredMapScene),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[var(--ember-map-bg)]" aria-hidden="true" />,
  },
);
import {
  AnimatedButton,
  SlideIn,
  ScalePresence,
  StatusDot,
} from "@/components/ember-anim";
import {
  SAMPLE_INCIDENTS,
  PLAYBACK_FRAMES,
  type Incident,
} from "@/lib/sample-data";
import {
  useLiveIncidentsNew,
  useFireRiskNew, useWeatherNew,
  useDashboardNew,
  useFireStationsNew, useSourceHealthNew,
  usePersistenceStatsNew, useHistoryNew,
  useSatelliteNew,
} from "@/lib/use-app-data";
import { useRealtimeIncidents } from "@/lib/use-realtime-incidents";
import { useFollowedIncidents } from "@/lib/use-followed-incidents";
import { useNotifications } from "@/lib/use-notifications";
import { enrichIncidentWithLiveContext } from "@/lib/incident-context";
import { adaptHistoryToIncident } from "@/lib/history-view";
import { buildDashboardMetrics } from "@/lib/dashboard-metrics";
import { useIncidentFilterUrl } from "@/lib/use-incident-filter-url";
import type { DashboardPriorityIncident, HistoryIncident } from "@/lib/types";
import { deriveHeadlineTrust } from "@/lib/source-trust";
import { sourceHealthToTrust } from "@/lib/source-health-adapter";
import { buildSourceHealthPresentation } from "@/lib/source-health-presentation";
import type { AerialLayerStatus } from "@/lib/aerial/status";
import { countIncidentStates } from "@/lib/incident-presentation";
import { timeAgo } from "@/lib/relative-time";
import { resolveRefreshOutcome } from "@/lib/refresh-state";
import { resolveLiveStatusTransition } from "@/lib/live-status";
import { useIsMounted, useIsWideDesktop } from "@/hooks/use-wide-desktop";

// ============================================================
// Helpers
// ============================================================

function incidentPropertiesOf(
  incident: Incident | DashboardPriorityIncident,
): Incident["properties"] | undefined {
  return "properties" in incident ? incident.properties : undefined;
}

// ============================================================
// Main page
// ============================================================

export default function Home() {
  const { theme, setTheme } = useTheme();
  const { language: lang, changeLanguage } = useLanguage();
  const mounted = useIsMounted();
  const isWideDesktop = useIsWideDesktop();
  const mapTheme = normalizeMapTheme(theme);

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

  useIncidentFilterUrl();

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
  const [aerialStatus, setAerialStatus] = useState<AerialLayerStatus | null>(null);
  const sourceHealth = useSourceHealthNew();
  const sourceHealthTrust = useMemo(
    () => deriveHeadlineTrust((sourceHealth.data?.sources ?? []).map(sourceHealthToTrust)),
    [sourceHealth.data?.sources],
  );
  const sourceHealthPresentation = useMemo(
    () => buildSourceHealthPresentation({
      sources: sourceHealth.data?.sources ?? [],
      headlineTrust: sourceHealthTrust,
      sourceDataState: sourceHealth.data?.dataState,
      sourceError: sourceHealth.error,
      liveTrust: liveIncidents.trust,
      lang,
    }),
    [
      lang,
      liveIncidents.trust,
      sourceHealth.data?.dataState,
      sourceHealth.data?.sources,
      sourceHealth.error,
      sourceHealthTrust,
    ],
  );
  const sourceHealthState = sourceHealthPresentation.state;
  const sourceHealthReason = sourceHealthPresentation.reason;
  const optionalLayerWarning = sourceHealthPresentation.optionalLayerWarning;
  const persistenceStats = usePersistenceStatsNew();
  const history = useHistoryNew(undefined, true);
  const [selectedHistoryIncident, setSelectedHistoryIncident] = useState<HistoryIncident | null>(null);
  const dashboard = useDashboardNew();
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
    fireRiskFilter,
    playbackHour, setPlaybackHour,
    isPlaying, setIsPlaying,
    notifOpen, setNotifOpen,
    showReportModal, setShowReportModal,
    mobileTab, setMobileTab,
    reconcileIncidentSelection,
    showShortcuts, setShowShortcuts,
    overlayStack, closeTopOverlay,
    resetIncidentFilters,
  } = useUIStore();

  const mapRef = useRef<EmberMapHandle>(null);
  const [rightSidebarLayout, setRightSidebarLayout] = useState({ open: false, width: 48 });
  const mapChromeInsets = useMemo(
    () => deriveMapChromeInsets({
      mode: "wide",
      exploreOpen: rightSidebarLayout.open,
      drawerWidth: rightSidebarLayout.width,
      sheetHeight: 0,
      safeAreaBottom: 0,
    }),
    [rightSidebarLayout],
  );

  const { notifications, unreadCount, markAllRead: markAllNotifsRead } = useNotifications();

  // Follow state — intentionally browser-local until server ownership is configured.
  const {
    followedIds: followedIncidents,
    readState: followedReadState,
    pendingIds: pendingFollowIds,
    toggleFollow: toggleFollowPersisted,
    markFollowedIncidentsRead,
    storageState: followStorageState,
  } = useFollowedIncidents();

  const refreshInFlightRef = useRef(false);

  // Read incident ID from URL query param on initial load (for share links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const incidentParam = params.get("incident");
    if (incidentParam) {
      setSelectedIncidentId(incidentParam);
    }
  }, []);

  // Default view is the Situational Awareness dashboard with the left
  // sidebar. We do NOT auto-select a fire-location panel on initial
  // load — that hid the full map and made the user feel locked in.
  // Selection now happens only when the user clicks a marker / row.
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

  const visibleIncidents = useMemo(
    () => deriveVisibleIncidents({
      incidents: liveIncidents.incidents,
      playbackHour,
      filters: incidentFilters,
      sampleIncidents: SAMPLE_INCIDENTS,
      playbackFrames: PLAYBACK_FRAMES,
    }),
    [playbackHour, incidentFilters, liveIncidents.incidents],
  );

  const incidentCounts = useMemo(
    () => countIncidentStates(visibleIncidents.map((incident) => ({ status: incident.status }))),
    [visibleIncidents],
  );

  const visibleSeverityCounts = useMemo(
    () => countIncidentSeverities(visibleIncidents),
    [visibleIncidents],
  );

  const visibleIncidentIds = useMemo(
    () => new Set(visibleIncidents.map((incident) => incident.id)),
    [visibleIncidents],
  );

  useEffect(() => {
    // Keep share-link selections intact while the initial incident request is
    // still loading. Reconciling an empty result during that window would
    // clear the URL-selected incident before the live data arrives.
    if (liveIncidents.loading) return;
    if (selectedHistoryIncident?.id === selectedIncidentId) return;
    reconcileIncidentSelection(visibleIncidentIds);
  }, [liveIncidents.loading, reconcileIncidentSelection, selectedHistoryIncident, selectedIncidentId, visibleIncidentIds]);

  // Build GeoJSON features for the fire risk layer (filtered by fireRiskFilter)
  const fireRiskFeatures: FireRiskFeature[] = useMemo(() => {
    return toFireRiskFeatures(fireRisk.data?.records, fireRiskFilter);
  }, [fireRisk.data, fireRiskFilter]);

  // Build GeoJSON features for fire stations
  const fireStationsFeatures: FireStationFeature[] = useMemo(() => {
    return toFireStationFeatures(fireStations.data?.stations);
  }, [fireStations.data]);

  // Build GeoJSON features for NASA FIRMS satellite detections
  const satelliteFeatures = useMemo(() => {
    return toSatelliteFeatures(satellite.data?.detections);
  }, [satellite.data]);

  const selectedIncident = useMemo(
    () => {
      if (!selectedIncidentId) return null;
      const live = visibleIncidents.find((incident) => incident.id === selectedIncidentId);
      if (live) return live;
      return selectedHistoryIncident?.id === selectedIncidentId
        ? adaptHistoryToIncident(selectedHistoryIncident)
        : null;
    },
    [selectedHistoryIncident, selectedIncidentId, visibleIncidents]
  );

  const incidentFocus = useIncidentFocus({
    mapRef,
    incident: selectedIncident
      ? {
          id: selectedIncident.id,
          displayName: selectedIncident.displayName,
          latitude: selectedIncident.latitude,
          longitude: selectedIncident.longitude,
        }
      : null,
  });

  // Incident Focus owns the camera, while the page owns responsive tab
  // selection. Keep compact/tablet focus on the map even when the Inspector
  // was opened from Incidents, Alerts, or More, then restore that tab after the
  // camera has returned to overview.
  const [focusPreviousMobileTab, setFocusPreviousMobileTab] = useState<MobileTab | null>(null);
  const restoreMobileTabAfterFocus = useCallback(() => {
    const previousTab = focusPreviousMobileTab;
    if (!previousTab) return;
    setFocusPreviousMobileTab(null);
    setMobileTab(previousTab);
  }, [focusPreviousMobileTab, setMobileTab]);

  const enterIncidentFocus = useCallback(() => {
    const canEnter = incidentFocus.enabled && incidentFocus.capability.allowed;
    incidentFocus.enter();
    if (!canEnter || isWideDesktop !== false) return;
    if (mobileTab !== "map") {
      setFocusPreviousMobileTab(mobileTab);
      setMobileTab("map");
    }
  }, [incidentFocus, isWideDesktop, mobileTab, setMobileTab]);

  useEffect(() => {
    if (incidentFocus.state !== "idle") return;
    const timer = window.setTimeout(restoreMobileTabAfterFocus, 0);
    return () => window.clearTimeout(timer);
  }, [incidentFocus.state, restoreMobileTabAfterFocus]);

  const incidentFocusActive = incidentFocus.state === "active"
    || incidentFocus.state === "entering"
    || incidentFocus.state === "exiting";

  const incidentFocusStatusDesktop = incidentFocus.enabled && selectedIncident ? (
    <MapChrome insets={mapChromeInsets} region="status" topOffset={48} className="hidden xl:block" testId="incident-focus-status-desktop">
      <IncidentFocusControls
          lang={lang}
          state={incidentFocus.state}
          capability={incidentFocus.capability}
          incidentName={selectedIncident.displayName}
          placement="map"
          onEnter={enterIncidentFocus}
          onExit={incidentFocus.exit}
          onReturnToOverview={incidentFocus.returnToOverview}
        />
    </MapChrome>
  ) : null;

  const incidentFocusStatusMobile = incidentFocus.enabled && selectedIncident ? (
    <IncidentFocusControls
      lang={lang}
      state={incidentFocus.state}
      capability={incidentFocus.capability}
      incidentName={selectedIncident.displayName}
      placement="map"
      isMobile
      onEnter={enterIncidentFocus}
      onExit={incidentFocus.exit}
      onReturnToOverview={incidentFocus.returnToOverview}
    />
  ) : null;

  const incidentFocusPanel = {
    state: incidentFocus.state,
    capability: incidentFocus.capability,
    onEnter: enterIncidentFocus,
    onExit: incidentFocus.exit,
    onReturnToOverview: incidentFocus.returnToOverview,
  };

  // ---------------------------------------------------------
  // Dashboard metrics — prefer server-aggregated /api/dashboard
  // Fall back to client-side compute if dashboard endpoint hasn't loaded
  // ---------------------------------------------------------
  const dashboardMetrics = useMemo(
    () => buildDashboardMetrics(dashboard.data, liveIncidents.incidents),
    [dashboard.data, liveIncidents.incidents],
  );

  // Top critical incidents — prefer server, fall back to client
  const topCriticalIncidents = useMemo(() => {
    const priorityIds = dashboard.data?.topPriority?.map((incident) => incident.id) ?? [];
    return reconcilePriorityIncidents(priorityIds, visibleIncidents, 20);
  }, [dashboard.data, visibleIncidents]);

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
  const applyIncidentSelection = useCallback((id: string | null, source: IncidentSelectionSource) => {
    const decision = decideIncidentSelection(visibleIncidentIds, id, source);
    setSelectedHistoryIncident(null);
    setSelectedIncidentId(decision.selectedIncidentId);
    if ("flyToIncidentId" in decision) {
      setFlyToIncidentId(decision.flyToIncidentId ?? null);
    }
  }, [setFlyToIncidentId, setSelectedIncidentId, visibleIncidentIds]);

  const handleSelectIncident = useCallback((id: string | null) => {
    applyIncidentSelection(id, "list");
  }, [applyIncidentSelection]);

  // When the user clicks a marker ON THE MAP, fly to it.
  // Sidebar/notification selections use handleSelectIncident (no fly).
  const handleSelectIncidentFromMap = useCallback((id: string | null) => {
    applyIncidentSelection(id, "map");
  }, [applyIncidentSelection]);

  // Toast-powered actions
  const refreshToastIdRef = useRef<string | number | null>(null);
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshPreviousRefetchedAtRef = useRef<Date | null>(null);
  const handleRefresh = useCallback(() => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    refreshStartedAtRef.current = Date.now();
    refreshPreviousRefetchedAtRef.current = liveIncidents.refetchedAt;
    refreshToastIdRef.current = toast.loading(t(lang, "toast.refreshing"));
    liveIncidents.refetch();
  }, [liveIncidents, lang]);

  useEffect(() => {
    const outcome = resolveRefreshOutcome({
      inFlight: refreshInFlightRef.current,
      startedAt: refreshStartedAtRef.current,
      loading: liveIncidents.loading,
      failed: Boolean(liveIncidents.error),
      refetchedAt: liveIncidents.refetchedAt,
      previousRefetchedAt: refreshPreviousRefetchedAtRef.current,
    });
    if (outcome === "error") {
      toast.error(t(lang, "toast.refreshFailed"), { id: refreshToastIdRef.current ?? undefined });
      refreshInFlightRef.current = false;
      return;
    }
    if (outcome === "success") {
      toast.success(t(lang, "toast.refreshed"), { id: refreshToastIdRef.current ?? undefined });
      refreshInFlightRef.current = false;
    }
  }, [lang, liveIncidents.error, liveIncidents.loading, liveIncidents.refetchedAt]);

  const handleLocate = useCallback(() => {
    if (selectedIncidentId) {
      setFlyToIncidentId(selectedIncidentId);
      const inc = selectedIncident;
      if (inc) {
        toast.success(`${t(lang, "toast.centeredOn")} ${inc.displayName}`, {
          description: tFmt(lang, "toast.centeredOnDescription", { place: inc.municipality || inc.displayName }),
        });
      }
    }
  }, [lang, selectedIncident, selectedIncidentId, setFlyToIncidentId]);

  const handleResetView = useCallback(() => {
    if (incidentFocus.state !== "idle") {
      incidentFocus.returnToOverview();
    } else {
      mapRef.current?.resetView();
    }
    toast(t(lang, "toast.resetView"), { description: t(lang, "toast.showingAll") });
  }, [incidentFocus, lang]);

  const handleToggleFollow = useCallback(async (id: string) => {
    if (pendingFollowIds.has(id)) return;
    if (followStorageState === "loading") return;
    if (followStorageState === "unavailable") {
      toast.error(t(lang, "toast.alertsUnavailable"));
      return;
    }
    const wasFollowing = followedIncidents.has(id);
    const incident = liveIncidents.incidents.find((i) => i.id === id);
    // Historical detail records are not part of the live follow domain. This
    // guard also covers keyboard/marker actions that bypass the detail button.
    if (!incident || incident.isLive === false) return;
    const name = incident.displayName;
    try {
      const applied = await toggleFollowPersisted(id, incident.lastUpdated);
      if (!applied) return;
      if (wasFollowing) {
        toast(t(lang, "toast.unfollowed"), { description: name });
      } else {
        toast.success(t(lang, "toast.followedLocal"), {
          description: tFmt(lang, "toast.followedLocalDescription", { name }),
        });
      }
    } catch {
      toast.error(t(lang, "toast.followUpdateFailed"));
    }
  }, [followStorageState, followedIncidents, liveIncidents.incidents, pendingFollowIds, toggleFollowPersisted, lang]);

  // Toast on live data status change
  const prevFallbackRef = useRef(false);
  useEffect(() => {
    const transition = resolveLiveStatusTransition({
      previousUsingFallback: prevFallbackRef.current,
      usingFallback: liveIncidents.usingFallback,
      liveCount: liveIncidents.liveCount,
    });

    if (transition === "fallback") {
      toast.error(t(lang, "toast.liveUnavailable"), {
        description: t(lang, "toast.fallbackDesc"),
      });
    }
    if (transition === "restored") {
      toast.success(t(lang, "toast.liveRestored"), {
        description: lang === "pt"
          ? `${liveIncidents.liveCount} incidentes da ANEPC`
          : `${liveIncidents.liveCount} incidents from ANEPC`,
      });
    }
    prevFallbackRef.current = liveIncidents.usingFallback;
  }, [liveIncidents.usingFallback, liveIncidents.liveCount, lang]);

  const handleKeyboardLocate = useCallback((id: string) => {
    setFlyToIncidentId(id);
  }, [setFlyToIncidentId]);

  const { searchInputRef, shortcutsPanelRef } = useKeyboardShortcuts({
    showShortcuts,
    setShowShortcuts,
    hasOpenOverlay: overlayStack.length > 0,
    selectedIncidentId,
    incidentFocusActive,
    closeTopOverlay,
    exitIncidentFocus: incidentFocus.exit,
    closeIncident: () => setSelectedIncidentId(null),
    refresh: handleRefresh,
    toggleFollow: handleToggleFollow,
    locateIncident: handleKeyboardLocate,
  });

  // ============================================================
  // Render
  // ============================================================

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
    label: localizeActiveFilterLabel(filter, incidentFilters, lang),
  })), [
    incidentFilters,
    resetSeverityFilter,
    setHideResolved,
    setQuickFilter,
    setPhaseFilter,
    setResourceFilter,
    setSearchQuery,
    lang,
  ]);
  const activeFilterCount = activeFilterItems.length;

  // Desktop and mobile render separate FiltersPanel instances so each layout
  // keeps its own tab state, but the filter/data contract must remain identical.
  // Keep the shared page-owned values in one typed adapter and vary only the
  // layout-specific props at each render site.
  const sharedFilters = {
    lang,
    searchQuery,
    setSearchQuery,
    quickFilter,
    setQuickFilter,
    phaseFilter,
    setPhaseFilter,
    resourceFilter,
    setResourceFilter,
    severityFilter,
    toggleSeverity,
    resetSeverityFilter,
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
    fireRiskReady: !!fireRisk.data,
    fireRiskCount: fireRisk.data?.count ?? 0,
    fireStationsReady: !!fireStations.data,
    fireStationsCount: fireStations.data?.count ?? 0,
    satelliteReady: !!satellite.data,
    satelliteCount: satellite.data?.count ?? 0,
    sourceHealth: sourceHealth.data?.sources ?? [],
    aerialStatus,
    liveCount: visibleIncidents.length,
    severityCounts: visibleSeverityCounts,
    activeFilters: activeFilterItems,
  } satisfies Omit<FiltersPanelProps, "variant" | "searchInputRef">;

  const sharedIncidentDetailProps = selectedIncident ? {
    incident: enrichIncidentWithLiveContext(selectedIncident, weather.data, fireRisk.data),
    onClose: () => setSelectedIncidentId(null),
    isFollowed: followedIncidents.has(selectedIncident.id),
    onToggleFollow: () => handleToggleFollow(selectedIncident.id),
    followPending: pendingFollowIds.has(selectedIncident.id),
    followStorageState,
    lang,
    sourceHealthState,
    sourceHealthReason,
    incidentFocus: incidentFocus.enabled ? incidentFocusPanel : undefined,
  } satisfies Omit<IncidentDetailPanelProps, "isMobile" | "hideHeader"> : null;

  return (
    <HomeShell skipLink={skipLink}>

      {/* ===== MOBILE INCIDENT DETAIL (bottom sheet with drag-to-dismiss) ===== */}
      <BottomSheet
        open={isWideDesktop === false && !!selectedIncident && incidentFocus.state !== "entering" && incidentFocus.state !== "active" && incidentFocus.state !== "exiting"}
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
        {sharedIncidentDetailProps && (
          <IncidentDetailPanel
            key={sharedIncidentDetailProps.incident.id}
            {...sharedIncidentDetailProps}
            isMobile
          />
        )}
      </BottomSheet>

      {/* ===== LEFT: SITUATION (awareness only; query controls live in Explore) ===== */}
      <div className="hidden xl:flex h-full flex-shrink-0 w-[360px] border-r border-[var(--ember-border)] flex-col">
        <SituationPanel
          lang={lang}
          incidentCount={visibleIncidents.length}
          activeCount={incidentCounts.active}
          containedCount={incidentCounts.contained}
          resolvedCount={incidentCounts.resolved}
          criticalCount={visibleIncidents.filter((incident) => incident.severity === "critical").length}
          priorityIncidents={topCriticalIncidents}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={handleSelectIncident}
          onOpenAllIncidents={() => setQuickFilter("all")}
          trustState={sourceHealthState}
          trustReason={sourceHealthReason}
          updatedAt={sourceHealthTrust.sourceUpdatedAt ?? liveIncidents.trust.sourceUpdatedAt ?? liveIncidents.refetchedAt}
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
                  className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--ember-critical)] text-white text-meta font-bold flex items-center justify-center tabular-nums"
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
              incidents={visibleIncidents}
              selectedIncidentId={selectedIncidentId}
              theme={mapTheme}
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
          <MapChrome insets={mapChromeInsets} region="controls" className="hidden xl:block" testId="map-controls-chrome">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-col gap-1.5 pointer-events-auto"
              data-testid="map-controls"
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
          </MapChrome>

          {/* Map attribution overlay (citizen-facing) */}
          {incidentFocusStatusDesktop}
          <MapChrome insets={mapChromeInsets} region="status" anchor="left" className="hidden xl:block" testId="map-attribution">
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border-strong)] rounded-md px-3 py-1.5 text-xs text-[var(--ember-text)] shadow-[var(--ember-shadow-sm)] flex items-center gap-1.5 font-medium">
                <Flame className="w-3 h-3 text-[var(--ember-critical)] flex-shrink-0" />
                <span className="font-mono font-bold text-[var(--ember-text)]">
                  {visibleIncidents.length}
                </span>
                <span className="text-[var(--ember-text-muted)]">{t(lang, "map.incidentsVisible")}</span>
                <span className={`border-l border-[var(--ember-border)] pl-1.5 text-meta ${liveIncidents.trust.state === "fresh" ? "text-[var(--ember-text-faint)]" : "text-[var(--ember-warning)]"}`} title={liveIncidents.trust.reason ?? undefined}>
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
          </MapChrome>

          {/* Advanced map layers — toggled from sidebar MAP LAYERS section */}
          <AdvancedMapLayers
            flags={{ biomass: showBiomass, risk: showCompositeRisk, aerial: showAerial }}
            lang={lang}
            onAerialStatusChange={setAerialStatus}
          />

          {/* Legend — collapsible (desktop) + compact (mobile) */}
          <MapChrome insets={mapChromeInsets} region="legend" className="hidden xl:block" testId="map-legend-chrome">
            <CollapsibleLegend
              lang={lang}
              positioned={false}
              visibleCount={visibleIncidents.length}
              layerStates={{
                satellite: deriveLayerAvailability({
                  enabled: showSatellite,
                  hasData: !!satellite.data,
                  usingFallback: satellite.usingFallback,
                  error: satellite.error,
                  dataState: satellite.dataState?.state,
                }),
                community: visibleSources.has("community") ? "healthy" : "disabled",
                evacuation: visibleIncidents.some((incident) => incident.evacuationOrder) ? "healthy" : "disabled",
                fireRisk: deriveLayerAvailability({
                  enabled: showFireRisk,
                  hasData: !!fireRisk.data,
                  usingFallback: fireRisk.usingFallback,
                  error: fireRisk.error,
                  dataState: fireRisk.dataState?.state,
                }),
              }}
            />
          </MapChrome>
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
            chromeInsets={mapChromeInsets}
          />
        </div>
      </main>

      {/* ===== RIGHT: COLLAPSIBLE RAIL (Filters + Detail + News panels) ===== */}
      {isWideDesktop === true && (
      <RightSidebar
        selectedIncidentId={isWideDesktop === true ? selectedIncidentId : null}
        onCloseDetail={() => setSelectedIncidentId(null)}
        onEscape={overlayStack.length === 0 && incidentFocus.state !== "idle" ? incidentFocus.exit : undefined}
        escapeEnabled={overlayStack.length === 0}
        onLayoutChange={setRightSidebarLayout}
        activeFilterCount={activeFilterCount}
        news={<NewsSection lang={lang} />}
        filters={
          <FiltersPanel
            {...sharedFilters}
            variant="desktop"
            searchInputRef={searchInputRef}
          />
        }
        detail={
          isWideDesktop === true && sharedIncidentDetailProps ? (
            <IncidentDetailPanel
              key={sharedIncidentDetailProps.incident.id}
              {...sharedIncidentDetailProps}
              hideHeader
            />
          ) : null
        }
      />
      )}

      {/* ===== NOTIFICATIONS DRAWER ===== */}
      <AnimatePresence>
        {notifOpen && (
          <NotificationsDrawer
            key="notif-drawer"
            notifications={notifications}
            onClose={() => setNotifOpen(false)}
            onMarkAllRead={markAllNotifsRead}
            onSelectIncident={(id) => {
              handleSelectIncident(id);
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
          <HistoryModal
            onClose={() => setShowHistoryModal(false)}
            onSelectIncident={(incident) => {
              setSelectedHistoryIncident(incident);
              setSelectedIncidentId(incident.id);
              setFlyToIncidentId(null);
              setShowHistoryModal(false);
            }}
            lang={lang}
            sharedHistory={history}
          />
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
          incidentFocusActive={incidentFocusActive}
          incidentCount={visibleIncidents.length}
          criticalCount={visibleIncidents.filter((i) => i.severity === "critical").length}
          unreadNotificationCount={unreadCount}
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
          onLocate={handleResetView}
          lang={lang}
          peekTotal={visibleIncidents.length}
          peekActive={incidentCounts.active}
          peekCritical={visibleIncidents.filter((i) => i.severity === "critical").length}
          peekHigh={visibleIncidents.filter((i) => i.severity === "high").length}
          peekIncidents={topCriticalIncidents.slice(0, 5).map((inc) => {
            const properties = incidentPropertiesOf(inc);
            return {
              id: inc.id,
              displayName: inc.displayName || "",
              severity: inc.severity,
              municipality: inc.municipality ?? undefined,
              statusGroup: properties?.statusGroup,
              statusText: properties?.statusText,
              personnel: "personnel" in inc ? inc.personnel : undefined,
            };
          })}
          onTapIncident={handleSelectIncident}
          lastUpdated={liveIncidents.refetchedAt || null}
          dataTrust={liveIncidents.trust}
          optionalLayerWarning={optionalLayerWarning}
          onRefresh={async () => {
            try {
              await Promise.all([
                liveIncidents.refetchAsync(),
                dashboard.refetchAsync(),
              ]);
            } catch {}
          }}
          activeFilters={activeFilterItems}
          map={null}
          incidentFocusStatus={incidentFocusStatusMobile}
          dashboard={
            <DashboardPanel
              mode="full"
              metrics={dashboardMetrics}
              topIncidents={topCriticalIncidents}
              recentHistory={history.data?.incidents ?? []}
              onSelectIncident={handleSelectIncident}
              onSelectHistoryIncident={(incident) => {
                setSelectedHistoryIncident(incident);
                setSelectedIncidentId(incident.id);
                setFlyToIncidentId(null);
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
              hideResolved={hideResolved}
              setHideResolved={setHideResolved}
              severityFilter={severityFilter}
              toggleSeverity={toggleSeverity}
              visibleSources={visibleSources}
              toggleSource={toggleSource}
              selectedIncidentId={selectedIncidentId}
              followedIncidentIds={followedIncidents}
              followedReadState={followedReadState}
              onMarkFollowingSeen={markFollowedIncidentsRead}
              activeFilterCount={activeFilterCount}
              onClearIncidentFilters={resetIncidentFilters}
              loading={dashboard.loading}
              lang={lang}
              dataFetchedAt={liveIncidents.refetchedAt}
              dashboardError={!!dashboard.error}
              onRetryDashboard={() => dashboard.refetch?.()}
            />
          }
          sidebar={
            <FiltersPanel
              {...sharedFilters}
              variant="mobile"
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
                <p className="text-meta text-[var(--ember-text-faint)] text-center pt-2">Lumes · v0.2.0</p>
              </div>
            </div>
          }
        />
      </div>

       {/* ===== LONG-PRESS MARKER MENU (mobile) ===== */}
       {markerMenu && (() => {
         return (
          <LongPressActions
            x={markerMenu.x}
            y={markerMenu.y}
            onClose={() => setMarkerMenu(null)}
            isFollowed={followedIncidents.has(markerMenu.incidentId)}
            onFollow={() => handleToggleFollow(markerMenu.incidentId)}
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
              handleToggleFollow(markerMenu.incidentId);
            }}
            onOpenDetail={() => {
              handleSelectIncidentFromMap(markerMenu.incidentId);
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
              ref={shortcutsPanelRef}
              role="dialog"
              aria-modal="true"
              aria-label={t(lang, "shortcuts.title")}
              tabIndex={-1}
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
    </HomeShell>
  );
}

// ============================================================
// Sidebar
// ============================================================
